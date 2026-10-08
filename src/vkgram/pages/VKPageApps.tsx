import {createEffect, createMemo, createSignal, For, onCleanup, Show} from 'solid-js';
import type {BotMenuButton, User} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import formatNumber from '@helpers/number/formatNumber';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import matchesQuery from '@/vkgram/utils/matchesQuery';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKEmptyState from '@/vkgram/components/VKEmptyState';

// popular apps asked at a time
const PAGE = 24;
// recent apps shown in the strip
const RECENT_LIMIT = 12;

/**
 * Opens a mini app the way Telegram does, inside the client: Web K's own
 * web-app window (`appImManager.openWebApp` — the same popup the chat's
 * «Открыть» and the global search use, with its confirmation, theme and
 * permissions). A bot with a main app opens it; one with a menu-button app
 * opens that; a bot without an app opens its chat instead.
 */
export async function openVKMiniApp(peerId: PeerId) {
  const botId = peerId.toUserId();
  try {
    const [{default: appImManager}, user] = await Promise.all([
      import('@lib/appImManager'),
      rootScope.managers.appUsersManager.getUser(botId) as Promise<User.user>
    ]);

    if(user?.pFlags?.bot_has_main_app) {
      await appImManager.openWebApp({botId, peerId, main: true});
      return;
    }

    const userFull = await rootScope.managers.appProfileManager.getProfile(botId);
    const menuButton = userFull?.bot_info?.menu_button as BotMenuButton.botMenuButton;
    if(menuButton?._ === 'botMenuButton') {
      await appImManager.openWebApp({
        botId,
        peerId,
        url: menuButton.url,
        buttonText: menuButton.text,
        fromBotMenu: true
      });
      return;
    }
  } catch(err) {
    // the user closed the confirmation, or the bot has no app after all: its chat is the fallback
    if(err) console.error('VKgram: failed to open the mini app', err);
    else return;
  }

  openVKChat(peerId);
}

function AppCard(props: {peerId: PeerId, compact?: boolean}) {
  const peers = usePeers();
  const user = () => peers[props.peerId] as User.user;
  const subtitle = () => {
    const count = user()?.bot_active_users;
    if(count) return `${formatNumber(count, 1)} польз. в месяц`;
    const username = user() && getPeerActiveUsernames(user())[0];
    return username ? '@' + username : 'мини-приложение';
  };

  return (
    <button
      type="button"
      class="vk-app-card"
      classList={{'is-compact': props.compact}}
      title={user()?.first_name}
      onClick={() => openVKMiniApp(props.peerId)}
    >
      <AvatarNewTsx peerId={props.peerId} size={props.compact ? 56 : 48} />
      <span class="vk-app-card-info">
        <span class="vk-app-card-title">{user()?.first_name || 'Приложение'}</span>
        <Show when={!props.compact}>
          <span class="vk-app-card-subtitle">{subtitle()}</span>
        </Show>
      </span>
    </button>
  );
}

/**
 * «Приложения» — Telegram Mini Apps: «Недавние» (the apps the user opened,
 * Telegram's top peers `bots_app`) and «Популярные» (Telegram's catalog,
 * `bots.getPopularAppBots`, paged as the end of the list comes near). Both
 * lists and the bots' data are Web K's (`appUsersManager.getTopPeers`,
 * `appAttachMenuBotsManager.getPopularAppBots`); the search filters what is
 * loaded. An app opens inside the client (`openVKMiniApp`).
 */
export default function VKPageApps() {
  const peers = usePeers();
  const [query, setQuery] = createSignal('');

  const [recent, setRecent] = createSignal<PeerId[]>();
  rootScope.managers.appUsersManager.getTopPeers('bots_app').then((topPeers) => {
    setRecent(topPeers.map((peer) => peer.id).slice(0, RECENT_LIMIT));
  }, (err) => {
    console.error('VKgram: failed to load the recent apps', err);
    setRecent([]);
  });

  // * «Популярные», a page at a time
  const [popular, setPopular] = createSignal<PeerId[]>([]);
  const [isLoading, setLoading] = createSignal(false);
  const [isFailed, setFailed] = createSignal(false);
  // undefined: nothing more to load
  let nextOffset: string | undefined = '';
  let disposed = false;
  onCleanup(() => disposed = true);

  const loadMore = async() => {
    if(isLoading() || nextOffset === undefined) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await rootScope.managers.appAttachMenuBotsManager.getPopularAppBots(nextOffset, PAGE);
      if(disposed) return;
      const known = new Set(popular());
      setPopular((list) => [...list, ...result.userIds.map((id) => id.toPeerId(false)).filter((peerId) => !known.has(peerId))]);
      nextOffset = result.nextOffset || undefined;
    } catch(err) {
      console.error('VKgram: failed to load the popular apps', err);
      setFailed(true);
    } finally {
      if(!disposed) setLoading(false);
    }
  };
  void loadMore();

  const matches = (peerId: PeerId) => {
    const user = peers[peerId] as User.user;
    return !query().trim() || (user && matchesQuery(query(), user.first_name, getPeerActiveUsernames(user)));
  };
  const filteredRecent = createMemo(() => (recent() ?? []).filter(matches));
  const filteredPopular = createMemo(() => popular().filter(matches));

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  createEffect(() => {
    const element = sentinel();
    // re-armed after every page: a sentinel still in view has nothing new to report
    void popular().length;
    if(!element || isLoading() || isFailed()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, {rootMargin: '300px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="vk-page vk-apps">
      {/* the search as its own block, like in «Сообщениях» */}
      <div class="vk-block vk-messages-search-block">
        <div class="vk-messages-search">
          <VKSearchField value={query()} placeholder="Поиск приложений" onInput={setQuery} />
        </div>
      </div>

      <section class="vk-block vk-page-block" aria-labelledby="vk-apps-title">
        <h1 id="vk-apps-title" class="vk-page-title vk-visually-hidden">Мини-приложения</h1>

        <Show when={filteredRecent().length}>
          <h2 class="vk-apps-subtitle">Недавние</h2>
          <div class="vk-apps-recent">
            <For each={filteredRecent()}>
              {(peerId) => <AppCard peerId={peerId} compact />}
            </For>
          </div>
        </Show>

        <h2 class="vk-apps-subtitle">Популярные</h2>
        <Show
          when={filteredPopular().length}
          fallback={
            <Show
              when={!isLoading()}
              fallback={<p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка приложений…</p>}
            >
              <Show
                when={!isFailed()}
                fallback={
                  <p class="vk-page-text vk-page-text-secondary vk-list-empty">
                    Не удалось загрузить приложения.{' '}
                    <button type="button" class="vk-link-button" onClick={() => loadMore()}>Повторить</button>
                  </p>
                }
              >
                <VKEmptyState
                  icon="apps"
                  title={query().trim() ? 'Ничего не найдено' : 'Приложений пока нет'}
                  description={query().trim() ? 'Попробуйте другой запрос.' : undefined}
                />
              </Show>
            </Show>
          }
        >
          <div class="vk-apps-grid">
            <For each={filteredPopular()}>
              {(peerId) => <AppCard peerId={peerId} />}
            </For>
          </div>
          <Show when={isFailed()}>
            <p class="vk-page-text vk-page-text-secondary">
              Не удалось загрузить ещё.{' '}
              <button type="button" class="vk-link-button" onClick={() => loadMore()}>Повторить</button>
            </p>
          </Show>
        </Show>
        <div ref={setSentinel} class="vk-list-sentinel" />
      </section>
    </div>
  );
}

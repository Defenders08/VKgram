import {createMemo, createSignal, For, onCleanup, Show} from 'solid-js';
import type {User} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import sortContacts from '@appManagers/utils/users/sortContacts';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import removeAccents from '@helpers/string/removeAccents';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {openWebKChat, openWebKProfile} from '@/vkgram/webk';
import createIncrementalList from '@/vkgram/hooks/createIncrementalList';
import VKSearchField from '@/vkgram/components/VKSearchField';

const AVATAR_SIZE = 48;

const normalize = (text: string) => removeAccents(text).toLowerCase();

/**
 * «Друзья» — the Telegram contacts of the signed-in user (not every user, not
 * every chat).
 *
 * Ids: `appUsersManager.getContactsPeerIds` — the list Web K's own contacts
 * tab is built from (its `contacts.getContacts` result is cached in the
 * manager). Users themselves — names, usernames, avatars — come from the
 * reactive peer store, so a rename or a new avatar reaches the rows without
 * any refresh. The list of ids is asked again only when Web K says a contact
 * was added or removed (`contacts_update`). Search filters what is already
 * loaded.
 */
export default function VKPageFriends() {
  const peers = usePeers();
  const listenerSetter = createListenerSetter();

  const [peerIds, setPeerIds] = createSignal<PeerId[]>();
  const [query, setQuery] = createSignal('');

  let loadToken = 0;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  const load = () => {
    const token = ++loadToken;
    rootScope.managers.appUsersManager.getContactsPeerIds(undefined, false, 'none').then((ids) => {
      if(disposed || token !== loadToken) return;
      setPeerIds(ids);
    }, (err) => {
      console.error('VKgram: failed to load contacts', err);
      if(!disposed && token === loadToken) setPeerIds((current) => current ?? []);
    });
  };

  load();

  // several contacts can be added/removed at once (deleting a selection) —
  // one reload for the whole burst
  let reloadTimeout: number;
  listenerSetter.add(rootScope)('contacts_update', () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = window.setTimeout(load, 0);
  });
  onCleanup(() => clearTimeout(reloadTimeout));

  // Web K's alphabetical order, computed from the reactive store: a renamed
  // contact moves to its new place by itself
  const sorted = createMemo(() => {
    const ids = peerIds();
    if(!ids) return;
    return sortContacts(ids, 'name', (userId) => peers[userId.toPeerId(false)] as User.user).peerIds;
  });

  const filtered = createMemo(() => {
    const ids = sorted();
    if(!ids) return;

    const text = normalize(query().trim().replace(/^@/, ''));
    if(!text) return ids;

    // every word of the query has to be found: first name, last name or a username
    const words = text.split(/\s+/);
    return ids.filter((peerId) => {
      const user = peers[peerId] as User.user;
      if(!user) return false;

      const haystack = normalize([
        user.first_name,
        user.last_name,
        ...getPeerActiveUsernames(user)
      ].filter(Boolean).join(' '));
      return words.every((word) => haystack.includes(word));
    });
  });

  const list = createIncrementalList({
    total: () => filtered()?.length ?? 0,
    resetKey: query
  });
  const visible = createMemo(() => filtered()?.slice(0, list.count()) ?? []);

  return (
    <div class="vk-page vk-friends">
      <section class="vk-block vk-page-block" aria-labelledby="vk-friends-title">
        <h1 id="vk-friends-title" class="vk-page-title">
          Друзья
          <Show when={peerIds()}>
            <span class="vk-page-text-secondary vk-list-count"> {peerIds().length}</span>
          </Show>
        </h1>

        <VKSearchField value={query()} placeholder="Поиск друзей" onInput={setQuery} />

        <Show
          when={filtered()}
          fallback={<p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка контактов…</p>}
        >
          <Show
            when={filtered().length}
            fallback={
              <p class="vk-page-text vk-page-text-secondary vk-list-empty">
                {query().trim() ? 'Ничего не найдено.' : 'В вашем списке контактов пока никого нет.'}
              </p>
            }
          >
            <ul class="vk-peer-list">
              <For each={visible()}>
                {(peerId) => <FriendRow peerId={peerId} />}
              </For>
            </ul>
            <div ref={list.setSentinel} class="vk-list-sentinel" />
          </Show>
        </Show>
      </section>
    </div>
  );
}

function FriendRow(props: {peerId: PeerId}) {
  const peers = usePeers();
  const user = () => peers[props.peerId] as User.user;
  const name = () => {
    const value = user();
    if(!value) return '';
    if(value.pFlags.deleted) return 'Удалённый аккаунт';
    return [value.first_name, value.last_name].filter(Boolean).join(' ');
  };
  const username = () => getPeerActiveUsernames(user())[0];

  return (
    <li class="vk-peer-row">
      <button
        type="button"
        class="vk-peer-avatar"
        tabindex="-1"
        aria-hidden="true"
        onClick={() => openWebKProfile(props.peerId)}
      >
        <AvatarNewTsx peerId={props.peerId} size={AVATAR_SIZE} />
      </button>

      <div class="vk-peer-info">
        <button type="button" class="vk-link-button vk-peer-name" onClick={() => openWebKProfile(props.peerId)}>
          {name()}
        </button>
        <Show when={username()}>
          <div class="vk-peer-sub vk-page-text-secondary">@{username()}</div>
        </Show>
      </div>

      <div class="vk-peer-actions">
        <button type="button" class="vk-link-button" onClick={() => openWebKChat(props.peerId)}>
          Написать сообщение
        </button>
      </div>
    </li>
  );
}

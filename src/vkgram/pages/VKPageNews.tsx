import {createEffect, createMemo, createSignal, For, Match, on, onCleanup, onMount, Show, Switch} from 'solid-js';
import {openVKSection} from '@/vkgram/sections';
import VKFolderCreateModal from '@/vkgram/components/VKFolderCreateModal';
import VKFolderAddModal from '@/vkgram/components/VKFolderAddModal';
import useSubscribedChannels from '@/vkgram/hooks/useSubscribedChannels';
import useChannelFolders from '@/vkgram/hooks/useChannelFolders';
import createNewsFeed, {VKNewsRules} from '@/vkgram/hooks/createNewsFeed';
import {vkNewsSettings} from '@/vkgram/pages/news/settings';
import useNewsCustomize from '@/vkgram/pages/news/customize';
import VKNewsCustomizeModal from '@/vkgram/pages/news/VKNewsCustomizeModal';
import VKNewsSettings from '@/vkgram/pages/news/VKNewsSettings';
import VKNewsStories from '@/vkgram/pages/news/VKNewsStories';
import VKNewsNotifications from '@/vkgram/pages/news/VKNewsNotifications';
import VKChannelPost from '@/vkgram/pages/channel/VKChannelPost';
import VKEmptyState from '@/vkgram/components/VKEmptyState';
import VKIcon from '@/vkgram/components/VKIcons';
import VKTabs, {VKTabItem} from '@/vkgram/components/VKTabs';
import VKLocalFolders from '@/vkgram/components/VKLocalFolders';
import {vkLocalFolders} from '@/vkgram/pages/localFolders/settings';

// the tab of the main feed; the others are the ids of the user's folders
const ALL_TAB = 'all';

const isSameSet = (a?: Set<PeerId>, b?: Set<PeerId>) => {
  if(a === b) return true;
  if(!a || !b || a.size !== b.size) return false;
  for(const value of a) if(!b.has(value)) return false;
  return true;
};

/**
 * «Новости» — the posts of the channels the user is subscribed to, newest
 * first, as one feed. The posts are the channel page's own (`VKChannelPost`:
 * channel avatar and name, text, media, date, reactions, comments); the feed
 * itself is `createNewsFeed`, which merges the channels' histories. Older
 * posts come as the end of the list comes near (an IntersectionObserver on a
 * sentinel — no scroll listeners).
 *
 * Tabs: «Все» — every channel — and one tab per chat folder of the user that
 * has channels (a folder without channels has no tab); a folder tab shows the
 * channels of that folder. The local folders join the same set of tabs.
 * «+» opens Web K's own folder creation popup (over this page, no section
 * change); the new folder comes back through Web K's `filter_update` event.
 *
 * On a phone the tabs are one strip that scrolls sideways (the server folders
 * and the local ones together), with «+» pinned at its right end — it opens
 * both kinds of folders in one window (`VKFolderAddModal`, its tabs). The
 * strip's two settings buttons of the desktop side rail — «Настройки ленты»
 * and «Настроить папки» — have no room there: the top bar's «Настроить» icon
 * opens them merged into one window (`VKNewsCustomizeModal`), the same panels
 * the side rail drops.
 * «Настройки ленты» says which channels the feed leaves
 * out — archived (by default), muted — and whether that is for «Все»
 * only or for the folders too (the default). The rules go into the feed's source: a channel that
 * is out is never read, not hidden afterwards.
 * When the filters take out most of the channels, the page says so and offers
 * «Показать все каналы»: the muted filter is switched off for this visit only
 * (the saved settings are not touched).
 *
 * Above the feed, as in Telegram: the stories strip (`VKNewsStories`) and the
 * suggestion to turn notifications on (`VKNewsNotifications`, until it is
 * accepted or closed).
 */
export default function VKPageNews() {
  // «Все» is every channel of the user, in whatever folder: the folders are read too, none is missed
  const subscribed = useSubscribedChannels({customFolders: true});
  const folders = useChannelFolders();

  // the folders of the user, in the order of Web K's chat list (every one, with or without channels)
  const allFolders = () => folders.folders();
  // one tab per folder that has channels; a folder without any has no tab.
  // Only the folder itself counts (a folder whose channels are all archived or muted keeps its tab:
  // the filters may take them out, the folder still has them). Until the channels are read nothing
  // is known about the folders, so only «Все» is shown (no tabs that appear and vanish).
  const folderTabs = createMemo(() => {
    if(!subscribed.isReady()) return [];
    const channelPeerIds = new Set(subscribed.channels().map((dialog) => dialog.peerId));
    return allFolders().filter((folder) => {
      for(const peerId of folder.peerIds) if(channelPeerIds.has(peerId)) return true;
      return false;
    });
  }, undefined, {
    // dialogs change all the time; the tabs are rebuilt only when the set of folders with channels changes
    equals: (a, b) => a.length === b.length && a.every((folder, index) => folder === b[index])
  });
  const tabs = createMemo<VKTabItem<string>[]>(() => [
    {id: ALL_TAB, title: 'Все'},
    ...folderTabs().map((folder) => ({id: String(folder.id), title: folder.title}))
  ]);

  const [tab, setTab] = createSignal(ALL_TAB);
  // the picked local folder («Локальные папки» under the tabs): its channels make the feed
  const [localFolderId, setLocalFolderId] = createSignal<string>();
  // a folder that was deleted (or lost its last channel) under the open tab
  createEffect(() => {
    if(folders.isReady() && subscribed.isReady() && !tabs().some((item) => item.id === tab())) setTab(ALL_TAB);
  });

  // ── Local folders («Локальные папки» under the tabs) ────────────────────────
  // A folder shows here when it holds at least one subscribed channel.
  const localFolders = createMemo(() => {
    if(!subscribed.isReady()) return [];
    const channelPeerIds = new Set(subscribed.channels().map((dialog) => dialog.peerId));
    return vkLocalFolders().filter((folder) => folder.peerIds.some((id) => channelPeerIds.has(id)));
  }, undefined, {
    // dialogs change all the time; the block is rebuilt only when the set of folders with channels changes
    equals: (a, b) => a.length === b.length && a.every((folder, index) => folder === b[index])
  });
  const activeLocalFolder = createMemo(() => {
    const id = localFolderId();
    return id ? vkLocalFolders().find((folder) => folder.id === id) : undefined;
  });
  // the folder was deleted: put it down
  createEffect(() => {
    const id = localFolderId();
    if(id && !vkLocalFolders().some((folder) => folder.id === id)) setLocalFolderId(undefined);
  });
  // picking a local folder switches the feed to its channels (the tab goes back to «Все»
  // internally, so nothing of the server tabs is highlighted): the tabs put it down,
  // it puts the tabs down — the two blocks are one set of tabs
  const toggleLocalFolder = (id: string) => {
    setLocalFolderId((current) => current === id ? undefined : id);
    setTab(ALL_TAB);
  };
  const onTab = (id: string) => {
    setTab(id);
    setLocalFolderId(undefined);
  };

  // the mobile strip: the server folders and the local ones are one line of tabs
  // (the desktop keeps its two blocks of the side rail)
  const mobileTabs = createMemo<VKTabItem<string>[]>(() => [
    ...tabs(),
    ...localFolders().map((folder) => ({id: folder.id, title: folder.title}))
  ]);
  const onMobileTab = (id: string) => {
    if(localFolders().some((folder) => folder.id === id)) toggleLocalFolder(id);
    else onTab(id);
  };

  // «Настроить»: the settings of the feed and of the folders in one window; the signal is
  // module-level — the icon of the mobile top bar opens the same window (desktop keeps
  // its own dropdown of the side rail, bound to the very same signal)
  const [isSettingsOpen, setSettingsOpen] = useNewsCustomize();
  // the desktop «+» makes a Telegram folder (Web K's flow); the mobile one offers
  // both kinds in one window
  const [isFolderModalOpen, setIsFolderModalOpen] = createSignal(false);
  const [isFolderAddOpen, setIsFolderAddOpen] = createSignal(false);

  // The desktop and mobile tabs are separate layouts, but only one is mounted at a time.
  // This keeps the feed settings' outside-click handler from seeing the other layout.
  const [isDesktop, setIsDesktop] = createSignal(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 601px)').matches
  );
  onMount(() => {
    const media = window.matchMedia('(min-width: 601px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    onCleanup(() => media.removeEventListener?.('change', update));
  });

  // «Показать все каналы»: the muted filter is off for now; not saved, gone with the page
  const [isMutedShown, setMutedShown] = createSignal(false);
  // the user's own choice of the filter is a new start
  createEffect(on(() => vkNewsSettings().hideMuted, () => setMutedShown(false), {defer: true}));

  const rules = createMemo<VKNewsRules>(() => {
    const settings = vkNewsSettings();
    const serverFolder = tab() === ALL_TAB ? undefined : allFolders().find((folder) => String(folder.id) === tab());
    const localFolder = activeLocalFolder();
    // «Все» without a folder is filtered by default; a folder (server or local) only when the settings say so
    const isFiltered = (!serverFolder && !localFolder) || settings.scope === 'all';

    // a local folder narrows the tab's channels down: the intersection of the two sets
    let peerIds: Set<PeerId> | undefined;
    if(serverFolder && localFolder) {
      peerIds = new Set([...serverFolder.peerIds].filter((id) => localFolder.peerIds.includes(id)));
    } else if(serverFolder) {
      peerIds = serverFolder.peerIds;
    } else if(localFolder) {
      peerIds = new Set(localFolder.peerIds);
    }

    return {
      peerIds,
      hideArchived: isFiltered && settings.hideArchived,
      hideMuted: isFiltered && settings.hideMuted && !isMutedShown()
    };
  }, undefined, {
    // dialogs change all the time; only other rules are another feed (a new one starts from the top)
    // (a folder that was read again with the same members is the same feed)
    equals: (a, b) => isSameSet(a.peerIds, b.peerIds) && a.hideArchived === b.hideArchived && a.hideMuted === b.hideMuted
  });
  const feed = createNewsFeed({source: subscribed, rules});

  // the filters leave a few channels of many: the feed looks like «one channel» and the user must know why
  const hiddenCount = () => feed.isReady() ? feed.scopeChannelCount() - feed.channelCount() : 0;
  const hidesMost = () => hiddenCount() >= 3 && hiddenCount() > feed.channelCount();

  // the folder itself has no channel (as opposed to the rules leaving them all out)
  const isFolderWithoutChannels = createMemo(() => {
    const peerIds = rules().peerIds;
    return !!peerIds && !subscribed.channels().some((dialog) => peerIds.has(dialog.peerId));
  });

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  createEffect(() => {
    const element = sentinel();
    // a new page re-arms the observer: a sentinel that is still in view has nothing to report by itself
    void feed.postKeys().length;
    if(!element || feed.isEnd() || feed.isLoadingMore()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) feed.loadMore();
    }, {rootMargin: '400px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  // where the feed's posts start: the released posts appear there, the button brings the user to them
  let postsTop: HTMLDivElement;
  const showPendingPosts = () => {
    feed.releasePending();
    postsTop.scrollIntoView({behavior: 'smooth', block: 'start'});
  };

  return (
    <div class="vk-page vk-news">
      <Show when={isFolderModalOpen()}>
        <VKFolderCreateModal onClose={() => setIsFolderModalOpen(false)} />
      </Show>
      <Show when={isFolderAddOpen()}>
        <VKFolderAddModal
          onClose={() => setIsFolderAddOpen(false)}
          // the new folder is picked, so its result is seen in the feed at once
          onCreatedLocal={(id) => setLocalFolderId(id)}
        />
      </Show>
      <div class="vk-news-column">
        <div class="vk-news-layout">
          <div class="vk-news-main">
            <VKNewsStories hidePeople={vkNewsSettings().hidePeople} />
            <VKNewsNotifications />

            {/* live posts wait behind this button instead of jumping into the feed above where the user reads */}
            <Show when={feed.pendingCount() > 0}>
              <button type="button" class="vk-button vk-news-pending" onClick={showPendingPosts}>
                <VKIcon name="up" size={14} />
                Показать новые посты
              </button>
            </Show>

            <section class="vk-block vk-page-block" aria-labelledby="vk-news-title">
              {/* no visible heading: the page is named by the menu; kept for screen readers */}
              <h1 id="vk-news-title" class="vk-page-title vk-visually-hidden">Новости</h1>

              <Show when={!isDesktop()}>
                {/* the mobile strip: the server folders and the local ones in one line that
                    scrolls sideways, «+» pinned at its right end — both kinds in one window
                    (the desktop «+» makes a Telegram folder, the settings are in the top bar) */}
                <div class="vk-news-mobile-tabs">
                  <VKTabs
                    tabs={mobileTabs()}
                    active={localFolderId() ?? tab()}
                    onChange={onMobileTab}
                    idPrefix="vk-news-mobile"
                    label="Папки"
                    addLabel="Создать папку"
                    addPinned
                    onAdd={() => setIsFolderAddOpen(true)}
                  />
                </div>

                <Show when={isSettingsOpen()}>
                  <VKNewsCustomizeModal
                    onClose={() => setSettingsOpen(false)}
                    channelCount={feed.isReady() ? feed.channelCount() : undefined}
                    scopeCount={feed.isReady() ? feed.scopeChannelCount() : undefined}
                    stats={feed.isReady() ? feed.scopeStats() : undefined}
                    hidesMost={hidesMost()}
                    isMutedShown={isMutedShown()}
                    canShowMuted={rules().hideMuted}
                    onShowAllChannels={() => setMutedShown(true)}
                    onRestoreFilters={() => setMutedShown(false)}
                    onSelectFolder={setLocalFolderId}
                  />
                </Show>
              </Show>

              <Show when={feed.isReady() && hidesMost()}>
            <p class="vk-page-text vk-page-text-secondary">
              Фильтры скрывают большинство каналов: в ленте {feed.channelCount()} из {feed.scopeChannelCount()}.{' '}
              <Show
                when={rules().hideMuted}
                fallback={<button type="button" class="vk-link-button" onClick={() => setSettingsOpen(true)}>Настройки ленты</button>}
              >
                <button type="button" class="vk-link-button" onClick={() => setMutedShown(true)}>Показать все каналы</button>
              </Show>
            </p>
          </Show>

          <div
            ref={postsTop}
            id={`vk-news-panel-${tab()}`}
            role="tabpanel"
            aria-labelledby={`vk-news-mobile-tab-${tab()} vk-news-desktop-tab-${tab()}`}
          >
            <Switch>
              <Match when={feed.isLoading()}>
                <p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка новостей…</p>
              </Match>

              <Match when={feed.totalChannelCount() === 0}>
                <VKEmptyState
                  icon="news"
                  title="Лента пуста"
                  description="Подпишитесь на каналы — их публикации появятся здесь."
                >
                  <button type="button" class="vk-button vk-news-action" onClick={() => openVKSection('channels')}>
                    Открыть «Каналы»
                  </button>
                </VKEmptyState>
              </Match>

              <Match when={feed.channelCount() === 0}>
                <VKEmptyState
                  icon="news"
                  title="Нет каналов для ленты"
                  description={!isFolderWithoutChannels() && (rules().hideArchived || rules().hideMuted) ?
                    'Каналы из архива и заглушённые не показываются. Это можно изменить в настройках ленты.' :
                    'В этой папке нет каналов.'}
                >
                  <Show when={!isFolderWithoutChannels() && (rules().hideArchived || rules().hideMuted)}>
                    <button type="button" class="vk-button vk-news-action" onClick={() => setSettingsOpen(true)}>
                      Настройки ленты
                    </button>
                  </Show>
                </VKEmptyState>
              </Match>

              <Match when={feed.postKeys().length === 0}>
                <VKEmptyState
                  icon="news"
                  title="Публикаций пока нет"
                  description="В каналах, на которые вы подписаны, ещё нет записей."
                />
              </Match>

              <Match when={true}>
                <div class="vk-channel-posts">
                  <For each={feed.postKeys()}>
                    {(key) => (
                      <Show when={feed.getPost(key)}>
                        {(post) => <VKChannelPost messages={post().messages} />}
                      </Show>
                    )}
                  </For>
                </div>
                <div ref={setSentinel} class="vk-list-sentinel" />
                <Show when={feed.isLoadingMore()}>
                  <p class="vk-page-text vk-page-text-secondary">Загрузка публикаций…</p>
                </Show>
              </Match>
            </Switch>
          </div>

          <Show when={feed.failedCount()}>
            <p class="vk-page-text vk-page-text-secondary">
              Не удалось загрузить часть каналов.{' '}
              <button type="button" class="vk-link-button" onClick={() => feed.retry()}>Повторить</button>
            </p>
              </Show>
            </section>
          </div>

          <Show when={isDesktop()}>
            <aside class="vk-news-side" aria-label="Навигация по новостям">
              <section class="vk-block vk-news-side-block">
              <VKTabs
                tabs={tabs()}
                active={localFolderId() ? '' : tab()}
                onChange={onTab}
                idPrefix="vk-news-desktop"
                label="Папки"
                addLabel="Создать папку"
                addInFooter
                onAdd={() => setIsFolderModalOpen(true)}
                actions={
                  <VKNewsSettings
                    id="vk-news-settings-desktop"
                    isOpen={isSettingsOpen()}
                    onOpenChange={setSettingsOpen}
                    channelCount={feed.isReady() ? feed.channelCount() : undefined}
                    scopeCount={feed.isReady() ? feed.scopeChannelCount() : undefined}
                    stats={feed.isReady() ? feed.scopeStats() : undefined}
                    hidesMost={hidesMost()}
                    isMutedShown={isMutedShown()}
                    canShowMuted={rules().hideMuted}
                    onShowAllChannels={() => setMutedShown(true)}
                    onRestoreFilters={() => setMutedShown(false)}
                  />
                }
              />
              </section>

              <section class="vk-block vk-folders-block">
                <VKLocalFolders
                  folders={localFolders()}
                  activeId={localFolderId()}
                  onToggle={toggleLocalFolder}
                  onSelect={setLocalFolderId}
                  label="Локальные папки новостей"
                  idPrefix="vk-news-local-desktop"
                  section="news"
                  addInFooter
                />
              </section>
            </aside>
          </Show>
        </div>
      </div>
    </div>
  );
}

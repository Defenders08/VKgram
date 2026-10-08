import {createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import type {Chat} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import renderDialogSubtitleParts from '@components/wrappers/dialogSubtitle';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import type {Dialog} from '@appManagers/appMessagesManager';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import removeAccents from '@helpers/string/removeAccents';
import {getMiddleware} from '@helpers/middleware';
import middlewarePromise from '@helpers/middlewarePromise';
import {FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import {openVKChannel, vkChannelPeerId} from '@/vkgram/pages/channel/route';
import VKChannelPage from '@/vkgram/pages/channel/VKChannelPage';
import createIncrementalList from '@/vkgram/hooks/createIncrementalList';
import useSubscribedChannels from '@/vkgram/hooks/useSubscribedChannels';
import getDialogLastMessage from '@/vkgram/utils/getDialogLastMessage';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKTabs, {VKTabItem} from '@/vkgram/components/VKTabs';
import VKLocalFolders from '@/vkgram/components/VKLocalFolders';
import VKFoldersSettings from '@/vkgram/components/VKFoldersSettings';
import VKFolderAddModal from '@/vkgram/components/VKFolderAddModal';
import VKFoldersCustomizeModal from '@/vkgram/components/VKFoldersCustomizeModal';
import useChannelFolders from '@/vkgram/hooks/useChannelFolders';
import {
  moveTgFolder,
  removeTgFolder,
  TG_FOLDERS_SETTINGS_NOTE,
  toSettingsFolders
} from '@/vkgram/pages/tgFolders/manage';
import {vkLocalFolders} from '@/vkgram/pages/localFolders/settings';
import useChannelsCustomize from '@/vkgram/pages/channels/customize';
import VKIcon from '@/vkgram/components/VKIcons';
import VKFolderCreateModal from '@/vkgram/components/VKFolderCreateModal';

const AVATAR_SIZE = 46;

const normalize = (text: string) => removeAccents(text).toLowerCase();

/**
 * «Каналы» — the broadcast channels the user is subscribed to (no groups, no
 * catalog, no global search).
 *
 * The list comes from Web K's dialogs storage in its own order (see
 * useSubscribedChannels); titles / usernames / avatars from the reactive peer
 * store; the last-message preview is rendered by the same helper Web K's chat
 * list uses. Search filters what is already loaded. A click opens the
 * channel's VKgram page (`pages/channel`); the chat itself is one button away there.
 */
export default function VKPageChannels() {
  return (
    <Show when={vkChannelPeerId()} fallback={<VKChannelsList />}>
      {(peerId) => <VKChannelPage peerId={peerId()} />}
    </Show>
  );
}

const ALL_TAB = 'all';

function VKChannelsList() {
  const peers = usePeers();
  const subscribed = useSubscribedChannels({customFolders: true});
  const folders = useChannelFolders();
  const [query, setQuery] = createSignal('');
  const [tab, setTab] = createSignal(ALL_TAB);
  // the picked local folder («Локальные папки» under the tabs): its channels filter the list
  const [localFolderId, setLocalFolderId] = createSignal<string>();
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

  // Only show folders that actually contain at least one subscribed channel.
  const folderTabs = createMemo(() => {
    if(!subscribed.isReady()) return [];
    const channelPeerIds = new Set(subscribed.channels().map((dialog) => dialog.peerId));
    return folders.folders().filter((folder) => {
      for(const peerId of folder.peerIds) if(channelPeerIds.has(peerId)) return true;
      return false;
    });
  }, undefined, {
    equals: (a, b) => a.length === b.length && a.every((folder, index) => folder === b[index])
  });

  const tabs = createMemo<VKTabItem<string>[]>(() => [
    {id: ALL_TAB, title: 'Все'},
    ...folderTabs().map((folder) => ({id: String(folder.id), title: folder.title}))
  ]);

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
  // the folder was deleted (it was removed, its last channel left): put it down
  createEffect(() => {
    const id = localFolderId();
    if(id && !vkLocalFolders().some((folder) => folder.id === id)) setLocalFolderId(undefined);
  });

  // picking a local folder switches the view to its channels (over all of them, like «Все»):
  // the tabs put it down, it puts the tabs down — the two blocks are one set of tabs
  const toggleLocalFolder = (id: string) => {
    setLocalFolderId((current) => current === id ? undefined : id);
    setTab(ALL_TAB);
  };
  const onTab = (id: string) => {
    setTab(id);
    setLocalFolderId(undefined);
  };

  // A folder can disappear while this page is open. Return to «Все» instead of
  // leaving the list on a tab that no longer exists.
  createEffect(() => {
    if(folders.isReady() && subscribed.isReady() && !tabs().some((item) => item.id === tab())) {
      setTab(ALL_TAB);
    }
  });

  const selectedPeerIds = createMemo(() => {
    if(tab() === ALL_TAB) return undefined;
    return folders.folders().find((folder) => String(folder.id) === tab())?.peerIds;
  });

  const filtered = createMemo(() => {
    const text = normalize(query().trim().replace(/^@/, ''));
    const peerIds = selectedPeerIds();
    const all = subscribed.channels();
    let inFolder = peerIds ? all.filter((dialog) => peerIds.has(dialog.peerId)) : all;

    // the picked local folder: only its channels (on top of the server folder's ones)
    const folder = activeLocalFolder();
    if(folder) {
      const localIds = new Set(folder.peerIds);
      inFolder = inFolder.filter((dialog) => localIds.has(dialog.peerId));
    }

    if(!text) return inFolder;

    const words = text.split(/\s+/);
    return inFolder.filter((dialog) => {
      const chat = peers[dialog.peerId] as Chat.channel;
      const haystack = normalize([chat?.title, ...getPeerActiveUsernames(chat)].filter(Boolean).join(' '));
      return words.every((word) => haystack.includes(word));
    });
  });

  const list = createIncrementalList({
    total: () => filtered().length,
    resetKey: () => `${tab()}:${query()}`
  });
  const visible = createMemo(() => filtered().slice(0, list.count()));

  const [isFolderModalOpen, setIsFolderModalOpen] = createSignal(false);
  const createFolder = () => setIsFolderModalOpen(true);
  // the mobile «+» offers both kinds of folders in one window; the management of the
  // Telegram folders and of the local ones lives in the top bar's «Настроить» window
  // (the signal is module-level — the bar and the page are separate component trees)
  const [isFolderAddOpen, setIsFolderAddOpen] = createSignal(false);
  const [isSettingsOpen, setSettingsOpen] = useChannelsCustomize();

  // ── Telegram's own folders: the settings panel of the main block ────────────
  // every folder of the account, in its order — the panel manages them all
  const tgFolders = createMemo(() => toSettingsFolders(folders.folders()));

  // the mobile strip: like in «Новостях» — one line of tabs, «Все» and the Telegram
  // folders first, then the local ones, «+» pinned at the right end (the desktop
  // keeps its two blocks of the side rail)
  const mobileFolderTabs = createMemo<VKTabItem<string>[]>(() => [
    ...tabs(),
    ...localFolders().map((folder) => ({id: folder.id, title: folder.title}))
  ]);
  const onMobileFolderTab = (id: string) => {
    if(localFolders().some((folder) => folder.id === id)) toggleLocalFolder(id);
    else onTab(id);
  };

  return (
    <div class="vk-page vk-channels">
      <Show when={isFolderModalOpen()}>
        <VKFolderCreateModal onClose={() => setIsFolderModalOpen(false)} />
      </Show>
      <Show when={isFolderAddOpen()}>
        <VKFolderAddModal
          onClose={() => setIsFolderAddOpen(false)}
          // the new folder is picked, so its result is seen in the list at once
          onCreatedLocal={(id) => toggleLocalFolder(id)}
        />
      </Show>
      <div class="vk-channels-layout">
        <main class="vk-channels-main">
          {/* the search and the tabs in the look of «Сообщений»: the search is its own
              block, on a phone the folder tabs join it in one continuous block */}
          <div class="vk-messages-controls-block">
            <div class="vk-block vk-messages-search-block">
              <div class="vk-messages-search">
                <VKSearchField value={query()} placeholder="Поиск каналов" onInput={setQuery} />
              </div>
            </div>

            <Show when={!isDesktop()}>
              <div class="vk-block vk-folders-block vk-messages-folders-tabs">
                <VKTabs
                  tabs={mobileFolderTabs()}
                  active={(localFolderId() ?? tab()) as string}
                  onChange={onMobileFolderTab}
                  idPrefix="vk-channels-folders-mobile"
                  label="Папки"
                  addLabel="Создать папку"
                  addPinned
                  onAdd={() => setIsFolderAddOpen(true)}
                />
              </div>

              <Show when={isSettingsOpen()}>
                <VKFoldersCustomizeModal
                  onClose={() => setSettingsOpen(false)}
                  tgFolders={folders.folders()}
                  onSelectFolder={(id) => toggleLocalFolder(id)}
                />
              </Show>
            </Show>
          </div>

          <section class="vk-block vk-page-block" aria-labelledby="vk-channels-title">
            <h1 id="vk-channels-title" class="vk-page-title vk-visually-hidden">
              Каналы
              <Show when={subscribed.isReady()}>
                <span class="vk-page-text-secondary vk-list-count"> {subscribed.channels().length}</span>
              </Show>
            </h1>

            <Show
              when={filtered().length}
              fallback={
                <p class="vk-page-text vk-page-text-secondary vk-list-empty">
                    {!subscribed.isReady() && !subscribed.channels().length ?
                      'Загрузка каналов…' :
                      query().trim() ? 'Ничего не найдено.' :
                      (tab() !== ALL_TAB || activeLocalFolder()) ? 'В этой папке нет каналов.' :
                      'Вы пока не подписаны ни на один канал.'}
                </p>
              }
            >
              <ul class="vk-peer-list vk-friend-list">
                <For each={visible()}>
                  {(dialog) => <ChannelRow dialog={dialog} notifyVersion={subscribed.notifyVersion} />}
                </For>
              </ul>
              <div ref={list.setSentinel} class="vk-list-sentinel" />
            </Show>
          </section>
        </main>

        <Show when={isDesktop()}>
          <aside class="vk-channels-side" aria-label="Папки каналов">
            <section class="vk-block vk-channels-side-block">
              <VKTabs
                tabs={tabs()}
                active={localFolderId() ? '' : tab()}
                onChange={onTab}
                idPrefix="vk-channels-desktop"
                label="Папки"
                addLabel="Создать папку"
                addInFooter
                onAdd={createFolder}
                actions={
                  <VKFoldersSettings
                    id="vk-channels-tg-settings-desktop"
                    folders={tgFolders()}
                    onCreate={createFolder}
                    onMove={moveTgFolder}
                    onRemove={removeTgFolder}
                    note={TG_FOLDERS_SETTINGS_NOTE}
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
                label="Локальные папки каналов"
                idPrefix="vk-channels-local-desktop"
                section="channels"
                addInFooter
              />
            </section>
          </aside>
        </Show>
      </div>
    </div>
  );
}

function ChannelRow(props: {
  dialog: Dialog,
  notifyVersion: (peerId: PeerId) => number
}) {
  const peers = usePeers();
  const peerId = () => props.dialog.peerId;
  const chat = () => peers[peerId()] as Chat.channel;
  const username = () => getPeerActiveUsernames(chat())[0];
  const lastMessage = createMemo(() => getDialogLastMessage(props.dialog));

  const isArchived = () => props.dialog.folder_id === FOLDER_ID_ARCHIVE;
  // the pin is a flag of the dialog itself; in the archive it isn't shown
  const isPinned = () => !isArchived() && !!props.dialog.pFlags?.pinned;
  const unreadCount = () => props.dialog.unread_count || 0;
  const isMarkedUnread = () => !!props.dialog.pFlags?.unread_mark;

  // Web K's answer (the channel's own settings, then the type defaults);
  // asked again only when this peer's notification settings change
  const [isMuted] = createResource(
    () => ({peerId: peerId(), version: props.notifyVersion(peerId())}),
    ({peerId}) => rootScope.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: true})
  );

  let previewEl: HTMLSpanElement;
  createEffect(() => {
    const message = lastMessage();
    const id = peerId();

    const middlewareHelper = getMiddleware();
    onCleanup(() => middlewareHelper.destroy());
    // * the subtitle renderer awaits its "middleware" over every promise —
    // * a raw MiddlewareHelper's middleware is a () => boolean, not a wrapper
    const middleware = middlewarePromise(middlewareHelper.get());

    if(!message) {
      previewEl.replaceChildren();
      return;
    }

    renderDialogSubtitleParts({
      peerId: id,
      isSaved: false,
      lastMessage: message,
      middleware,
      textColor: 'secondary-text-color',
      messageRenderer: wrapMessageForReply,
      peerTitleRenderer: wrapPeerTitle
    }).then((parts) => {
      previewEl.replaceChildren(...parts);
    }, () => {
      // interrupted by a newer message — nothing to do
    });
  });

  const time = () => {
    const message = lastMessage();
    return message ? formatDateAccordingToTodayNew(new Date(message.date * 1000)) : undefined;
  };

  const open = () => openVKChannel(peerId());

  return (
    <li class="vk-channel-row">
      <button type="button" class="vk-message-dialog" onClick={open}>
        <span class="vk-message-dialog-avatar">
          <AvatarNewTsx peerId={peerId()} size={AVATAR_SIZE} />
        </span>

        <span class="vk-message-dialog-main">
          <span class="vk-message-dialog-titleline">
            <strong class="vk-message-dialog-title">{chat()?.title}</strong>
            <Show when={username()}>
              <span class="vk-message-dialog-username">@{username()}</span>
            </Show>
            <Show when={isMuted()}>
              <span class="vk-message-dialog-flag" title="Без звука">
                <VKIcon name="bell-off" size={13} />
              </span>
            </Show>
            <Show when={isArchived()}>
              <span class="vk-message-dialog-username">в архиве</span>
            </Show>
          </span>
          <span class="vk-message-dialog-preview" ref={previewEl} />
        </span>

        <span class="vk-message-dialog-meta">
          <time class="vk-message-dialog-time">{time()}</time>
          <span class="vk-message-dialog-badges">
            <Show when={unreadCount() || isMarkedUnread()}>
              <span
                class="vk-message-dialog-unread"
                classList={{'is-muted': isMuted() === true, 'is-pending': isMuted() === undefined}}
              >
                {unreadCount() || ''}
              </span>
            </Show>
            <Show when={isPinned()}>
              <span class="vk-message-dialog-pin" title="Закреплён" aria-label="Закреплён">
                <VKIcon name="pin" size={14} />
              </span>
            </Show>
          </span>
        </span>
      </button>
    </li>
  );
}

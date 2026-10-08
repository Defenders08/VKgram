import {createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import type {Chat, User} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import sortContacts from '@appManagers/utils/users/sortContacts';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import removeAccents from '@helpers/string/removeAccents';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKProfile} from '@/vkgram/pages/profile/openProfile';
import createIncrementalList from '@/vkgram/hooks/createIncrementalList';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKTabs, {VKTabItem} from '@/vkgram/components/VKTabs';
import VKLocalFolders from '@/vkgram/components/VKLocalFolders';
import VKFolderCreateModal from '@/vkgram/components/VKFolderCreateModal';
import VKFolderAddModal from '@/vkgram/components/VKFolderAddModal';
import VKFoldersSettings from '@/vkgram/components/VKFoldersSettings';
import VKFoldersCustomizeModal from '@/vkgram/components/VKFoldersCustomizeModal';
import useChannelFolders from '@/vkgram/hooks/useChannelFolders';
import {vkLocalFolders} from '@/vkgram/pages/localFolders/settings';
import useFriendsCustomize from '@/vkgram/pages/friends/customize';
import {
  moveTgFolder,
  removeTgFolder,
  TG_FOLDERS_SETTINGS_NOTE,
  toSettingsFolders
} from '@/vkgram/pages/tgFolders/manage';
import {fetchFolder} from '@/vkgram/hooks/useSubscribedChannels';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import {FOLDER_ID_ALL} from '@appManagers/constants';
import type {Dialog} from '@appManagers/appMessagesManager';

const AVATAR_SIZE = 46;

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
  const folders = useChannelFolders();

  const [peerIds, setPeerIds] = createSignal<PeerId[]>();
  const [allDialogs, setAllDialogs] = createSignal<Dialog[]>([]);
  const [query, setQuery] = createSignal('');
  const [tab, setTab] = createSignal('contacts');
  // the picked local folder («Локальные папки» under the tabs): its people filter the list
  const [localFolderId, setLocalFolderId] = createSignal<string>();
  // the native folder creation window of Telegram's own folders (the «+» of the desktop rail);
  // the mobile «+» offers both kinds of folders in one window
  const [isFolderModalOpen, setFolderModalOpen] = createSignal(false);
  const [isFolderAddOpen, setFolderAddOpen] = createSignal(false);
  // «Настроить»: the management of the Telegram folders and of the local ones in one window;
  // the signal is module-level — the icon of the mobile top bar opens the same window
  const [isSettingsOpen, setSettingsOpen] = useFriendsCustomize();
  const [isDesktop, setIsDesktop] = createSignal(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 601px)').matches
  );

  // Contacts are shown in chronological order, like Telegram's recent-contact
  // view: people with the most recently active dialog come first. Contacts that
  // have no dialog history are kept at the end in the existing name order.
  const [dialogIndexes, setDialogIndexes] = createSignal<Map<PeerId, number>>(new Map(), {equals: false});

  let loadToken = 0;
  let dialogLoadToken = 0;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  onMount(() => {
    const media = window.matchMedia('(min-width: 601px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    onCleanup(() => media.removeEventListener?.('change', update));
  });

  const load = () => {
    const token = ++loadToken;
    rootScope.managers.appUsersManager.getContactsPeerIds(undefined, false, 'name').then((ids) => {
      if(disposed || token !== loadToken) return;
      setPeerIds(ids);
    }, (err) => {
      console.error('VKgram: failed to load contacts', err);
      if(!disposed && token === loadToken) setPeerIds((current) => current ?? []);
    });
  };

  load();

  const loadDialogOrder = () => {
    const token = ++dialogLoadToken;
    fetchFolder(FOLDER_ID_ALL, () => !disposed).then((dialogs) => {
      if(disposed || token !== dialogLoadToken) return;
      const dialogList = dialogs as Dialog[];
      setAllDialogs(dialogList);
      const next = new Map<PeerId, number>();
      for(const dialog of dialogList) {
        const index = getDialogIndex(dialog);
        if(index !== undefined) next.set(dialog.peerId, index);
      }
      setDialogIndexes(next);
    }, (err) => console.error('VKgram: failed to load dialog order for contacts', err));
  };

  loadDialogOrder();

  const updateDialogOrder = (dialog: Dialog | undefined) => {
    if(!dialog) return;
    const index = getDialogIndex(dialog);
    if(index === undefined) return;
    setDialogIndexes((current) => {
      const next = new Map(current);
      next.set(dialog.peerId, index);
      return next;
    });
    setAllDialogs((current) => {
      const existing = current.findIndex((item) => item.peerId === dialog.peerId);
      if(existing < 0) return [...current, dialog];
      const next = current.slice();
      next[existing] = dialog;
      return next;
    });
  };

  listenerSetter.add(rootScope)('dialogs_multiupdate', (updated) => {
    for(const [, item] of updated) updateDialogOrder(item.dialog as Dialog);
  });
  listenerSetter.add(rootScope)('dialog_flush', ({dialog}) => updateDialogOrder(dialog as Dialog));
  listenerSetter.add(rootScope)('dialog_unread', ({dialog}) => updateDialogOrder(dialog as Dialog));

  let reloadTimeout: number;
  listenerSetter.add(rootScope)('contacts_update', () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = window.setTimeout(load, 0);
  });
  onCleanup(() => clearTimeout(reloadTimeout));

  const sorted = createMemo(() => {
    const ids = peerIds();
    if(!ids) return;

    // Start from Web K's stable contact ordering, then move contacts with a
    // recent dialog to the top. This keeps users without chat history visible
    // and deterministic at the end of the list.
    const byName = sortContacts(ids, 'name', (userId) => peers[userId.toPeerId(false)] as User.user).peerIds;
    const indexes = dialogIndexes();
    return byName.slice().sort((a, b) => {
      const indexA = indexes.get(a);
      const indexB = indexes.get(b);
      if(indexA === undefined && indexB === undefined) return 0;
      if(indexA === undefined) return 1;
      if(indexB === undefined) return -1;
      return indexB - indexA;
    });
  });

  // «Все чаты» здесь означает только личные диалоги с пользователями.
  // Группы, каналы и другие типы peer'ов намеренно исключаем.
  const allChatPeerIds = createMemo(() => {
    const indexes = dialogIndexes();
    return allDialogs()
      .filter((dialog) => {
        const peer = peers[dialog.peerId] as User.user | Chat.chat | Chat.channel | undefined;
        // «Все чаты» — только живые человеческие аккаунты.
        // Боты и удалённые аккаунты сюда не попадают.
        return peer?._ === 'user' && !peer.pFlags?.bot && !peer.pFlags?.deleted;
      })
      .slice()
      .sort((a, b) => {
        const indexA = indexes.get(a.peerId);
        const indexB = indexes.get(b.peerId);
        if(indexA === undefined && indexB === undefined) return 0;
        if(indexA === undefined) return 1;
        if(indexB === undefined) return -1;
        return indexB - indexA;
      })
      .map((dialog) => dialog.peerId);
  });

  const folderTabs = createMemo(() => {
    const ids = peerIds();
    if(!ids || !folders.isReady()) return [];
    const contacts = new Set(ids);
    return folders.folders().filter((folder) => [...folder.peerIds].some((peerId) => contacts.has(peerId)));
  }, undefined, {
    equals: (a, b) => a.length === b.length && a.every((folder, index) => folder === b[index])
  });

  // ── Local folders («Локальные папки» under the tabs) ────────────────────────
  // A folder shows here when it holds at least one contact.
  const localFolders = createMemo(() => {
    const ids = peerIds();
    if(!ids) return [];
    const contacts = new Set(ids);
    return vkLocalFolders().filter((folder) => folder.peerIds.some((id) => contacts.has(id)));
  });
  const activeLocalFolder = createMemo(() => {
    const id = localFolderId();
    return id ? vkLocalFolders().find((folder) => folder.id === id) : undefined;
  });
  // the folder was deleted (it was removed, its contact list is gone): put it down
  createEffect(() => {
    const id = localFolderId();
    if(id && !vkLocalFolders().some((folder) => folder.id === id)) setLocalFolderId(undefined);
  });
  // picking a local folder switches the view to its contacts: the section tabs put it
  // down, it puts the tabs down — the two blocks are one set of tabs
  const toggleLocalFolder = (id: string) => {
    setLocalFolderId((current) => current === id ? undefined : id);
    setTab('contacts');
  };
  const onTab = (id: string) => {
    setTab(id);
    setLocalFolderId(undefined);
  };
  // the picked local folder: only its people (the «Поиск» tab stays global)
  const byLocalFolder = (ids: PeerId[]) => {
    const folder = activeLocalFolder();
    if(!folder) return ids;
    const peerIds = new Set(folder.peerIds);
    return ids.filter((id) => peerIds.has(id));
  };

  // the sorting tabs of the first block; Telegram's own folders (the ones that hold
  // at least one contact) live in a block of their own, the local ones — in the third
  const sortingTabs = createMemo<VKTabItem<string>[]>(() => [
    {id: 'contacts', title: 'Контакты'},
    {id: 'all-chats', title: 'Все чаты'},
    {id: 'search', title: 'Поиск'}
  ]);
  const tgFolderTabs = createMemo<VKTabItem<string>[]>(() =>
    folderTabs().map((folder) => ({id: String(folder.id), title: folder.title}))
  );

  // the mobile strip: like in «Новостях» — one line of tabs, the sections first, then the
  // Telegram folders and the local ones, «+» pinned at the right end (the desktop keeps
  // its three blocks of the side rail)
  const mobileFolderTabs = createMemo<VKTabItem<string>[]>(() => [
    ...sortingTabs(),
    ...tgFolderTabs(),
    ...localFolders().map((folder) => ({id: folder.id, title: folder.title}))
  ]);
  const onMobileFolderTab = (id: string) => {
    if(localFolders().some((folder) => folder.id === id)) toggleLocalFolder(id);
    else onTab(id);
  };


  // a Telegram folder can disappear while this page is open: return to «Контакты»
  createEffect(() => {
    if(!folders.isReady()) return;
    if(tab() === 'contacts' || tab() === 'all-chats' || tab() === 'search') return;
    if(!tgFolderTabs().some((item) => item.id === tab())) setTab('contacts');
  });

  const selectedFolder = createMemo(() => {
    if(tab() === 'contacts' || tab() === 'search') return undefined;
    return folders.folders().find((folder) => String(folder.id) === tab());
  });

  const filtered = createMemo(() => {
    if(tab() === 'all-chats') {
      const text = normalize(query().trim().replace(/^@/, ''));
      const ids = byLocalFolder(allChatPeerIds());
      if(!text) return ids;
      const words = text.split(/\s+/);
      return ids.filter((peerId) => {
        const peer = peers[peerId] as User.user | Chat.chat | Chat.channel;
        if(!peer) return false;
        const title = peer._ === 'user' ? [peer.first_name, peer.last_name].filter(Boolean).join(' ') : peer.title;
        const haystack = normalize([title, ...(peer._ === 'user' ? getPeerActiveUsernames(peer) : [])].filter(Boolean).join(' '));
        return words.every((word) => haystack.includes(word));
      });
    }

    const ids = sorted();
    if(!ids) return;
    const folder = selectedFolder();
    const inFolder = byLocalFolder(folder ? ids.filter((peerId) => folder.peerIds.has(peerId)) : ids);

    const text = normalize(query().trim().replace(/^@/, ''));
    if(!text || tab() === 'search') return inFolder;

    const words = text.split(/\s+/);
    return inFolder.filter((peerId) => {
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

  // The «Поиск» tab uses Web K's existing contacts search index. This keeps
  // the same account data and sorting as the header search without inventing
  // a second user cache.
  const [searchResults] = createResource(
    () => tab() === 'search' ? query().trim() : '',
    async(text) => {
      if(!text) return [] as PeerId[];
      try {
        if(text.startsWith('@')) {
          const username = text.slice(1).trim();
          if(!username) return [];
          const user = await rootScope.managers.appUsersManager.resolveUserByUsername(username);
          return user ? [user.id.toPeerId(false)] : [];
        }
        return await rootScope.managers.appUsersManager.getContactsPeerIds(text, false, 'name');
      } catch(err) {
        console.error('VKgram: failed to search accounts', err);
        return [];
      }
    }
  );

  const searchFiltered = createMemo(() => {
    if(tab() !== 'search') return [];
    return searchResults() ?? [];
  });

  const list = createIncrementalList({
    total: () => tab() === 'search' ? searchFiltered().length : (filtered()?.length ?? 0),
    resetKey: () => `${tab()}:${query()}`
  });
  const visible = createMemo(() => {
    const source = tab() === 'search' ? searchFiltered() : (filtered() ?? []);
    return source.slice(0, list.count());
  });

  return (
    <div class="vk-page vk-friends">
      <Show when={isFolderModalOpen()}>
        <VKFolderCreateModal onClose={() => setFolderModalOpen(false)} />
      </Show>
      <Show when={isFolderAddOpen()}>
        <VKFolderAddModal
          onClose={() => setFolderAddOpen(false)}
          // the new folder is picked, so its result is seen in the list at once
          onCreatedLocal={(id) => toggleLocalFolder(id)}
        />
      </Show>
      <div class="vk-friends-layout">
        <main class="vk-friends-main">
          {/* the search and the tabs in the look of «Сообщений»: the search is its own
              block, on a phone the folder tabs join it in one continuous block */}
          <div class="vk-messages-controls-block">
            <div class="vk-block vk-messages-search-block">
              <div class="vk-messages-search">
                <VKSearchField
                  value={query()}
                  placeholder={tab() === 'search' ? 'Поиск аккаунтов' : tab() === 'all-chats' ? 'Поиск людей в чатах' : 'Поиск друзей'}
                  onInput={setQuery}
                />
              </div>
            </div>

            <Show when={!isDesktop()}>
              <div class="vk-block vk-folders-block vk-messages-folders-tabs">
                <VKTabs
                  tabs={mobileFolderTabs()}
                  active={(localFolderId() ?? tab()) as string}
                  onChange={onMobileFolderTab}
                  idPrefix="vk-friends-folders-mobile"
                  label="Папки"
                  addLabel="Создать папку"
                  addPinned
                  onAdd={() => setFolderAddOpen(true)}
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

          <section class="vk-block vk-page-block" aria-labelledby="vk-friends-title">
            <h1 id="vk-friends-title" class="vk-page-title vk-visually-hidden">
              Друзья
              <Show when={tab() === 'all-chats' ? allDialogs() : peerIds()}>
                <span class="vk-page-text-secondary vk-list-count"> {(tab() === 'all-chats' ? allDialogs().length : peerIds().length)}</span>
              </Show>
            </h1>

            <Show
              when={tab() !== 'search' ? filtered() : searchResults()}
              fallback={<p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка…</p>}
            >
              <Show
                when={visible().length}
                fallback={
                  <p class="vk-page-text vk-page-text-secondary vk-list-empty">
                    {tab() === 'search' && !query().trim() ?
                      'Введите имя или @username, чтобы найти аккаунт.' :
                      query().trim() ? 'Ничего не найдено.' :
                      activeLocalFolder() ? (tab() === 'all-chats' ? 'В этой папке нет чатов.' : 'В этой папке нет контактов.') :
                      tab() === 'all-chats' ? 'Личных чатов пока нет.' :
                      tab() !== 'contacts' ? 'В этой папке нет контактов.' :
                      'В вашем списке контактов пока никого нет.'}
                  </p>
                }
              >
                <ul class="vk-peer-list vk-friend-list">
                  <For each={visible()}>
                    {(peerId) => tab() === 'all-chats' ? <ChatRow peerId={peerId} /> : <FriendRow peerId={peerId} />}
                  </For>
                </ul>
                <div ref={list.setSentinel} class="vk-list-sentinel" />
              </Show>
            </Show>
          </section>
        </main>

        <Show when={isDesktop()}>
          <aside class="vk-friends-side" aria-label="Навигация по друзьям">
            <section class="vk-block vk-friends-side-block">
              <VKTabs
                tabs={sortingTabs()}
                active={localFolderId() ? '' : tab()}
                onChange={onTab}
                idPrefix="vk-friends-desktop"
                label="Разделы"
              />
            </section>

            <section class="vk-block vk-folders-block">
              <section class="vk-side-folders" aria-label="Папки Телеграма">
                <VKTabs
                  tabs={tgFolderTabs()}
                  active={localFolderId() ? '' : tab()}
                  onChange={onTab}
                  idPrefix="vk-friends-tg-desktop"
                  label="Папки Телеграма"
                  addLabel="Создать папку"
                  addInFooter
                  onAdd={() => setFolderModalOpen(true)}
                  actions={
                    <VKFoldersSettings
                      id="vk-friends-tg-settings-desktop"
                      folders={toSettingsFolders(folders.folders())}
                      onCreate={() => setFolderModalOpen(true)}
                      onMove={moveTgFolder}
                      onRemove={removeTgFolder}
                      note={TG_FOLDERS_SETTINGS_NOTE}
                    />
                  }
                />
              </section>
            </section>

            <section class="vk-block vk-folders-block">
              <VKLocalFolders
                folders={localFolders()}
                activeId={localFolderId()}
                onToggle={toggleLocalFolder}
                onSelect={setLocalFolderId}
                label="Локальные папки друзей"
                idPrefix="vk-friends-local-desktop"
                section="friends"
                addInFooter
              />
            </section>
          </aside>
        </Show>
      </div>
    </div>
  );
}

/**
 * A row of the list in the look of a dialog of «Сообщения» (`.vk-message-dialog`): the avatar, the name
 * over the @username, a hover tint and a divider. The whole left part opens `onOpen`; the action at
 * the right (`actionLabel`) stays a separate button.
 */
function PeerRow(props: {
  peerId: PeerId,
  title: string,
  subtitle?: string,
  onOpen: () => void,
  actionLabel: string,
  onAction: () => void
}) {
  return (
    <li class="vk-friend-row">
      <button type="button" class="vk-friend-open" onClick={props.onOpen}>
        <span class="vk-message-dialog-avatar">
          <AvatarNewTsx peerId={props.peerId} size={AVATAR_SIZE} />
        </span>
        <span class="vk-message-dialog-main">
          <strong class="vk-message-dialog-title">{props.title}</strong>
          <Show when={props.subtitle}>
            <span class="vk-message-dialog-preview">{props.subtitle}</span>
          </Show>
        </span>
      </button>
      <div class="vk-friend-actions">
        <button type="button" class="vk-link-button" onClick={props.onAction}>{props.actionLabel}</button>
      </div>
    </li>
  );
}

function ChatRow(props: {peerId: PeerId}) {
  const peers = usePeers();
  const peer = () => peers[props.peerId] as User.user | Chat.chat | Chat.channel;
  const title = () => {
    const value = peer();
    if(!value) return '';
    if(value._ === 'user') {
      if(value.pFlags.deleted) return 'Удалённый аккаунт';
      return [value.first_name, value.last_name].filter(Boolean).join(' ');
    }
    return value.title || 'Чат';
  };
  const username = () => {
    const value = peer();
    return value?._ === 'user' ? getPeerActiveUsernames(value)[0] : undefined;
  };
  const open = () => openVKChat(props.peerId);

  return (
    <PeerRow
      peerId={props.peerId}
      title={title()}
      subtitle={username() ? '@' + username() : undefined}
      onOpen={open}
      actionLabel="Открыть чат"
      onAction={open}
    />
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
    <PeerRow
      peerId={props.peerId}
      title={name()}
      subtitle={username() ? '@' + username() : undefined}
      onOpen={() => openVKProfile(props.peerId)}
      actionLabel="Написать сообщение"
      onAction={() => openVKChat(props.peerId)}
    />
  );
}

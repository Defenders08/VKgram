import {Accessor, createMemo, createSignal, onCleanup} from 'solid-js';
import {createStore} from 'solid-js/store';
import type {Chat} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import type {Dialog} from '@appManagers/appMessagesManager';

const FETCH_LIMIT = 100;
const FOLDERS = [FOLDER_ID_ALL, FOLDER_ID_ARCHIVE];

/**
 * A broadcast channel the user is subscribed to, as Web K itself tells them
 * apart (`appPeersManager.isBroadcast`: a channel that is not a megagroup).
 * A «direct messages» channel (`monoforum`) is a chat, not a subscription.
 */
export function isSubscribedChannel(peer: unknown): peer is Chat.channel {
  const chat = peer as Chat.channel;
  return chat?._ === 'channel' &&
    !chat.pFlags.megagroup &&
    !chat.pFlags.monoforum &&
    !chat.pFlags.left;
}

/**
 * A group the user is a member of: a megagroup, or a basic group chat. Basic
 * groups abandoned for their supergroup version (`deprecated`) and left chats
 * are not.
 */
export function isGroupChat(peer: unknown): peer is Chat {
  const chat = peer as Chat;
  if(chat?._ === 'chat') return !chat.pFlags?.left;
  return chat?._ === 'channel' &&
    !!chat.pFlags.megagroup &&
    !chat.pFlags.monoforum &&
    !chat.pFlags.left;
}

/**
 * Pulls every dialog of a folder out of Web K's dialogs storage, page by page
 * the way its own chat list does (`offsetIndex` = the smallest index so far).
 * Once a folder is loaded the storage answers from memory.
 */
async function fetchFolder(folderId: number, isAlive: () => boolean) {
  const dialogs: Dialog[] = [];
  let offsetIndex: number;
  while(isAlive()) {
    const result = await rootScope.managers.dialogsStorage.getDialogs({
      filterId: folderId,
      offsetIndex,
      limit: FETCH_LIMIT,
      skipMigrated: true
    });

    const page = result.dialogs.filter(isDialog) as Dialog[];
    dialogs.push(...page);

    const nextOffset = result.dialogs.reduce((min, dialog) => {
      const index = getDialogIndex(dialog as Dialog);
      return index !== undefined && index < min ? index : min;
    }, offsetIndex ?? Infinity);

    // the end, or a page that moved nowhere (never loop forever)
    if(result.isEnd || !result.dialogs.length || nextOffset === Infinity || nextOffset === offsetIndex) {
      break;
    }

    offsetIndex = nextOffset;
  }

  return dialogs;
}

/**
 * The dialogs whose peer matches `isMatch`, in the order of Web K's dialogs.
 *
 * Source: `dialogsStorage.getDialogs` — the same store the chat list reads,
 * loaded from the top until its end. Unarchived dialogs come first in the
 * store's own order (pinned, then by the last message), archived ones follow
 * in theirs. No order is invented here. A dialog is kept up to date through
 * the events the chat list listens to (`dialogs_multiupdate`, `dialog_flush`,
 * `dialog_unread`, `dialog_drop`); what matches is decided from the reactive
 * peer store, so a dialog that changes type or is left drops out by itself.
 */
function usePeerDialogs(isMatch: (peer: unknown) => boolean) {
  const peers = usePeers();
  const listenerSetter = createListenerSetter();

  // dialogs by peer, replaced (not mutated) as events bring newer objects
  const [dialogs, setDialogs] = createSignal<Map<PeerId, Dialog>>(new Map(), {equals: false});
  const [isReady, setReady] = createSignal(false);
  // bumped for a peer when its notification settings change (mute state)
  const [notifyVersions, setNotifyVersions] = createStore<{[peerId: PeerId]: number}>({});

  let alive = true;
  onCleanup(() => {
    alive = false;
  });
  const isAlive = () => alive;

  const isTracked = (dialog: Dialog) => {
    return isDialog(dialog) &&
      dialog.peerId.isAnyChat() &&
      FOLDERS.includes(dialog.folder_id ?? FOLDER_ID_ALL);
  };

  const put = (dialog: Dialog) => {
    setDialogs((map) => {
      if(isTracked(dialog)) map.set(dialog.peerId, dialog);
      else map.delete(dialog.peerId);
      return map;
    });
  };

  // Events can arrive before the first full load ends; that load's snapshot
  // must not overwrite what they brought, so it is merged under them.
  const eventsSeen = new Set<PeerId>();

  listenerSetter.add(rootScope)('dialogs_multiupdate', (updated) => {
    setDialogs((map) => {
      for(const [peerId, {dialog}] of updated) {
        if(!isDialog(dialog)) continue;
        eventsSeen.add(peerId);
        if(isTracked(dialog)) map.set(peerId, dialog);
        else map.delete(peerId);
      }
      return map;
    });
  });
  listenerSetter.add(rootScope)('dialog_flush', ({peerId, dialog}) => {
    if(!isDialog(dialog)) return;
    eventsSeen.add(peerId);
    put(dialog);
  });
  listenerSetter.add(rootScope)('dialog_unread', ({peerId, dialog}) => {
    if(!isDialog(dialog)) return;
    eventsSeen.add(peerId);
    put(dialog);
  });
  listenerSetter.add(rootScope)('dialog_drop', (dialog) => {
    if(!isDialog(dialog)) return;
    eventsSeen.add(dialog.peerId);
    setDialogs((map) => {
      map.delete(dialog.peerId);
      return map;
    });
  });
  listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
    setNotifyVersions(dialog.peerId, (version) => (version || 0) + 1);
  });

  Promise.all(FOLDERS.map((folderId) => fetchFolder(folderId, isAlive))).then((folders) => {
    if(!alive) return;
    setDialogs((map) => {
      for(const dialog of folders.flat()) {
        if(!eventsSeen.has(dialog.peerId) && isTracked(dialog)) {
          map.set(dialog.peerId, dialog);
        }
      }
      return map;
    });
    setReady(true);
  }, (err) => {
    console.error('VKgram: failed to load dialogs', err);
    if(alive) setReady(true);
  });

  const matched: Accessor<Dialog[]> = createMemo(() => {
    const list: Dialog[] = [];
    for(const dialog of dialogs().values()) {
      if(isMatch(peers[dialog.peerId])) list.push(dialog);
    }

    // the stores' own order: by folder, then by the dialog index inside it
    // (pinned first, then the most recent message)
    return list.sort((a, b) => {
      const folderA = a.folder_id ?? FOLDER_ID_ALL;
      const folderB = b.folder_id ?? FOLDER_ID_ALL;
      if(folderA !== folderB) return folderA - folderB;
      return (getDialogIndex(b) ?? 0) - (getDialogIndex(a) ?? 0);
    });
  });

  return {
    dialogs: matched,
    isReady,
    notifyVersion: (peerId: PeerId) => notifyVersions[peerId] || 0
  };
}

/** The broadcast channels the user is subscribed to, as «Каналы» lists them. */
export default function useSubscribedChannels() {
  const {dialogs, isReady, notifyVersion} = usePeerDialogs(isSubscribedChannel);
  return {channels: dialogs, isReady, notifyVersion};
}

/** The groups the user is a member of, as «Группы» lists them. */
export function useSubscribedGroups() {
  const {dialogs, isReady, notifyVersion} = usePeerDialogs(isGroupChat);
  return {groups: dialogs, isReady, notifyVersion};
}

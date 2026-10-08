import {Accessor, createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import {createStore} from 'solid-js/store';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import {isDialog} from '@appManagers/utils/dialogs/isDialog';
import type {Dialog} from '@appManagers/appMessagesManager';
import createMutedPeers from '@/vkgram/hooks/createMutedPeers';
import {fetchFolder, isMessagesPeer, isSubscribedChannel} from '@/vkgram/hooks/useSubscribedChannels';
import {vkMessagesSettings} from '@/vkgram/pages/messages/settings';

const FOLDERS = [FOLDER_ID_ALL, FOLDER_ID_ARCHIVE];
const MAX_BADGE = 99;

export type MessagesUnread = {
  count: number,
  // nothing but muted dialogs is unread: the badge is grey, like a muted dialog's in the list
  isMuted: boolean
};

/** `99+` past ninety-nine, the number itself otherwise. */
export function formatUnreadBadge(count: number) {
  return count > MAX_BADGE ? `${MAX_BADGE}+` : String(count);
}

/**
 * The unread count of one dialog as Telegram reports it (`unread_count`); a dialog the user marked
 * as unread by hand has no count but still counts as one, as it does in Telegram's own folders.
 */
function getDialogUnread(dialog: Dialog) {
  return dialog.unread_count || (dialog.pFlags?.unread_mark ? 1 : 0);
}

// the last answer outlives the menu that asked: the mobile drawer is mounted anew every time it
// opens, and its badge must not start from nothing
const [lastKnown, setLastKnown] = createSignal<MessagesUnread>({count: 0, isMuted: false});

const isSame = (a: MessagesUnread, b: MessagesUnread) => a.count === b.count && a.isMuted === b.isMuted;

/**
 * The number on «Сообщения» in the menu. Nothing is counted here: the numbers are the
 * dialogs' own `unread_count` from the same Web K store the «Сообщения» list reads (kept up to
 * date by the same events), summed over the dialogs that list shows, and whether a dialog is
 * muted is Web K's own answer (`createMutedPeers`) — the one the list's grey badges use.
 *
 * What is summed follows the list's own rules: broadcast channels you can't write to are
 * «Каналы», not «Сообщения»; the archive, the muted dialogs and the channels are left out when
 * «Настройки диалогов» hide them. Muted dialogs do not add to the number (as in Telegram); when
 * the only unread ones are muted, their number is shown grey.
 */
export default function createMessagesUnread(): Accessor<MessagesUnread> {
  const peers = usePeers();
  const listenerSetter = createListenerSetter();

  const [dialogs, setDialogs] = createSignal(new Map<PeerId, Dialog>(), {equals: false});
  const [isReady, setReady] = createSignal(false);
  // bumped for a peer when its notification settings change (mute state)
  const [notifyVersions, setNotifyVersions] = createStore<{[peerId: PeerId]: number}>({});

  let alive = true;
  onCleanup(() => {
    alive = false;
    listenerSetter.removeAll();
  });

  const isTracked = (dialog: Dialog) => isDialog(dialog) && FOLDERS.includes(dialog.folder_id ?? FOLDER_ID_ALL);

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

  const isAlive = () => alive;
  // one folder that can't be read must not take the other away
  Promise.all(FOLDERS.map((folderId) => fetchFolder(folderId, isAlive).catch((err) => {
    console.error('VKgram: failed to load the folder', folderId, err);
    return [] as Dialog[];
  }))).then((folders) => {
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
  });

  // the dialogs of «Сообщения» that have something unread, under the list's own rules
  const unreadDialogs = createMemo(() => {
    const settings = vkMessagesSettings();
    const list: Dialog[] = [];
    for(const dialog of dialogs().values()) {
      if(!getDialogUnread(dialog)) continue;

      const peer = peers[dialog.peerId];
      if(!isMessagesPeer(peer)) continue;
      if(settings.hideArchived && dialog.folder_id === FOLDER_ID_ARCHIVE) continue;
      if(settings.hideChannels && isSubscribedChannel(peer)) continue;
      list.push(dialog);
    }
    return list;
  });

  // only the dialogs that matter are asked about their mute state
  const muted = createMutedPeers({
    peerIds: () => unreadDialogs().map((dialog) => dialog.peerId),
    version: (peerId) => notifyVersions[peerId] || 0,
    getDialog: (peerId) => dialogs().get(peerId)
  });

  // Until the dialogs are loaded and their mute state is known, the previous answer stays: a
  // half-known number would show up and then jump.
  const unread = createMemo<MessagesUnread>((previous) => {
    if(!isReady() || !muted.isResolved()) return previous;

    let unmuted = 0;
    let mutedCount = 0;
    for(const dialog of unreadDialogs()) {
      if(muted.isMuted(dialog.peerId)) mutedCount += getDialogUnread(dialog);
      else unmuted += getDialogUnread(dialog);
    }

    if(unmuted) return {count: unmuted, isMuted: false};
    if(vkMessagesSettings().hideMuted) return {count: 0, isMuted: false};
    return {count: mutedCount, isMuted: mutedCount > 0};
  }, lastKnown(), {equals: isSame});

  createEffect(() => setLastKnown(unread()));

  return unread;
}

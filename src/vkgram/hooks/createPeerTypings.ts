import {Accessor, createSignal} from 'solid-js';
import type {Chat, User} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import peerTitle from '@/vkgram/utils/peerTitle';

// Telegram sends «typing…» again every ~5 s while it lasts; if the «stopped» update never arrives
// (a lost packet), the status must not hang forever
const TYPING_TTL = 8000;

type Typing = {userId: PeerId, action: string};

const [typingMap, setTypingMap] = createSignal(new Map<PeerId, Typing[]>(), {equals: false});
const timers = new Map<PeerId, number>();
let started = false;

function setPeerTypings(peerId: PeerId, list: Typing[]) {
  window.clearTimeout(timers.get(peerId));
  timers.delete(peerId);

  setTypingMap((map) => {
    if(list.length) map.set(peerId, list);
    else map.delete(peerId);
    return map;
  });

  if(list.length) {
    timers.set(peerId, window.setTimeout(() => setPeerTypings(peerId, []), TYPING_TTL));
  }
}

/** One global listener on Web K's `peer_typings`, started with the first reader. */
function start() {
  if(started) return;
  started = true;

  rootScope.addEventListener('peer_typings' as any, (event: any) => {
    // typing inside a forum topic is not the dialog's typing
    if(!event || event.threadId) return;

    const list: Typing[] = [];
    for(const item of (event.typings || []) as any[]) {
      const action = item?.action?._ as string | undefined;
      const userId = (item?.userId ?? item?.peerId) as PeerId | undefined;
      if(!action || userId === undefined) continue;
      if(userId === rootScope.myId) continue;
      if(action === 'sendMessageCancelAction' || action === 'speakingInGroupCallAction') continue;
      list.push({userId, action});
    }

    setPeerTypings(event.peerId as PeerId, list);
  });
}

// what a person is doing, in the third person singular
const ACTION_TEXT: {[action: string]: string} = {
  sendMessageTypingAction: 'печатает',
  sendMessageRecordAudioAction: 'записывает голосовое сообщение',
  sendMessageRecordVideoAction: 'записывает видео',
  sendMessageRecordRoundAction: 'записывает видеосообщение',
  sendMessageUploadAudioAction: 'отправляет голосовое сообщение',
  sendMessageUploadPhotoAction: 'отправляет фото',
  sendMessageUploadVideoAction: 'отправляет видео',
  sendMessageUploadRoundAction: 'отправляет видеосообщение',
  sendMessageUploadDocumentAction: 'отправляет файл',
  sendMessageGeoLocationAction: 'выбирает местоположение',
  sendMessageChooseContactAction: 'выбирает контакт',
  sendMessageChooseStickerAction: 'выбирает стикер',
  sendMessageGamePlayAction: 'играет'
};

const actionText = (action: string) => ACTION_TEXT[action] ?? 'печатает';

/**
 * «печатает…» of a dialog, or `undefined` when nobody is typing. In a private chat it is the
 * action alone («печатает»); in a group the names come first («Аня печатает»,
 * «Аня и Борис печатают», «Аня, Борис и ещё 2 печатают»).
 */
export default function createPeerTypings(peerId: Accessor<PeerId>): Accessor<string | undefined> {
  start();
  const peers = usePeers();

  return () => {
    const id = peerId();
    const list = typingMap().get(id);
    if(!list?.length) return undefined;

    // a private chat (a user's id is positive in Web K) and a bot chat
    const isPrivate = !!id && !id.toString().startsWith('-');
    if(isPrivate) return actionText(list[0].action);

    const names = list.map(({userId}) => {
      const user = peers[userId] as User.user | Chat | undefined;
      return (user?._ === 'user' ? user.first_name : undefined) || peerTitle(user as any) || 'Кто-то';
    });

    if(names.length === 1) return `${names[0]} ${actionText(list[0].action)}`;
    if(names.length === 2) return `${names[0]} и ${names[1]} печатают`;
    return `${names[0]}, ${names[1]} и ещё ${names.length - 2} печатают`;
  };
}

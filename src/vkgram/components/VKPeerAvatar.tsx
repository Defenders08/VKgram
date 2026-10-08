import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import type {Chat, User} from '@layer';
import {AvatarNewTsx} from '@components/avatarNew';

type AnyPeer = User.user | Chat.chat | Chat.channel | undefined;

function peerLabel(peer: AnyPeer) {
  if(!peer) return '';
  if(peer._ === 'user') {
    if(peer.pFlags?.deleted) return 'Удалённый аккаунт';
    return [peer.first_name, peer.last_name].filter(Boolean).join(' ') || 'Пользователь';
  }
  return peer.title || 'Чат';
}

export function peerInitials(peer: AnyPeer) {
  const title = peerLabel(peer).trim();
  const words = title.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [title[0] || '?'])
    .join('')
    .toUpperCase();
}

/**
 * Web K's avatar in VKgram's wrapper. AvatarNewTsx can leave a broken <img> icon when a photo
 * is not (yet) usable: the wrapper notices the error and shows the initials on the project's blue
 * instead, and takes them away when the picture finally loads. Used by the dialog list, the chat
 * header and the messages — one avatar, one behaviour.
 */
export default function VKPeerAvatar(props: {peerId: PeerId, peer?: AnyPeer, size: number}) {
  let root!: HTMLSpanElement;
  const [showFallback, setShowFallback] = createSignal(false);

  const handleImageError = (event: Event) => {
    if(event.target instanceof HTMLImageElement) setShowFallback(true);
  };

  const handleImageLoad = (event: Event) => {
    if(event.target instanceof HTMLImageElement) setShowFallback(false);
  };

  onMount(() => {
    root.addEventListener('error', handleImageError, true);
    root.addEventListener('load', handleImageLoad, true);

    const image = root.querySelector('img');
    if(image?.complete && image.naturalWidth === 0) setShowFallback(true);
  });

  onCleanup(() => {
    root.removeEventListener('error', handleImageError, true);
    root.removeEventListener('load', handleImageLoad, true);
  });

  return (
    <span
      ref={root}
      class="vk-peer-avatar"
      classList={{'has-fallback': showFallback()}}
      style={{width: `${props.size}px`, height: `${props.size}px`}}
    >
      <AvatarNewTsx peerId={props.peerId} size={props.size} />
      <Show when={showFallback()}>
        <span class="vk-peer-avatar-fallback" aria-hidden="true">{peerInitials(props.peer)}</span>
      </Show>
    </span>
  );
}

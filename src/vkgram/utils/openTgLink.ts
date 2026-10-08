import rootScope from '@lib/rootScope';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {isBroadcastChannel} from '@/vkgram/hooks/useSubscribedChannels';

/**
 * Opens a Telegram (t.me / tg) link inside VKgram instead of sending the user
 * to the official Telegram web/client. Public channel and user links resolve
 * through Web K's own `resolveUsername` and open in VKgram's «Каналы» (channels)
 * or «Сообщения» (chats/users). Everything else (invite links `+…`, private
 * `/c/…` posts, non-telegram hosts) stays external — returns `true` if the link
 * was handled internally, `false` if the caller should keep an `<a target>`.
 */
export default async function openTgLink(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch{
    return false;
  }

  const host = parsed.hostname;
  if(host !== 't.me' && host !== 'www.t.me') return false;

  // invite links (`t.me/+XXXXXX`) and private-channel posts (`/c/{id}/{mid}`)
  // are not resolvable by username — let the browser handle them
  const segments = parsed.pathname.split('/').filter(Boolean);
  if(segments.length === 0 || segments[0].startsWith('+') || segments[0] === 'c') return false;

  const username = segments[0];

  try {
    const peer = await rootScope.managers.appUsersManager.resolveUsername(username);
    if(!peer) return false;

    const peerId = peer.id.toPeerId(peer._ !== 'user');
    // a broadcast channel opens its «Каналы» page; a megagroup is a chat, a user — a dialog
    if(isBroadcastChannel(peer)) {
      openVKChannelPage(peerId);
    } else {
      openVKChat(peerId);
    }
    return true;
  } catch{
    return false;
  }
}

/**
 * Opens a URL in a new external tab (fallback for links VKgram can't handle).
 * Only a web link is let out: anything else (`javascript:`, an unknown scheme)
 * is dropped rather than handed to the browser.
 */
export function openExternalLink(url: string) {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch{
    return;
  }
  if(protocol !== 'http:' && protocol !== 'https:') return;
  window.open(url, '_blank', 'noopener noreferrer');
}

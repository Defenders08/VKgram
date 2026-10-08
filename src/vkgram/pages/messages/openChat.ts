import {openVKSection} from '@/vkgram/sections';
import {setVKMessagePeer, setVKMessageAction, type VKMessageAction} from '@/vkgram/pages/messages/route';

/**
 * A chat with a user, a group or a bot — in VKgram's own «Сообщения», not in the Web K messenger
 * behind «Телеграм». The peer is stored first, so the page that mounts reads it as its open dialog
 * (the same value a `?vkgram=messages&peer=…` link carries); a «Сообщения» that is open already
 * follows the change by itself. `action` is a job for one message of that chat (see `VKMessageAction`).
 *
 * NB: lives apart from `messages/route.ts`, which must not import sections.ts.
 */
export function openVKChat(peerId: PeerId, action?: Pick<VKMessageAction, 'mid' | 'kind'>) {
  setVKMessagePeer(peerId);
  // an optional job for one message: scroll to it, reply to it, edit it (done by the chat once it shows)
  setVKMessageAction(action ? {peerId, ...action} : undefined);
  openVKSection('messages');
}

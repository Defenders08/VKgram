import type {Message} from '@layer';
import rootScope from '@lib/rootScope';

/**
 * «Переслать» for a post (an album is several messages): Web K's own forward
 * popup — the one the chat's menu opens, with the list of chats, the search,
 * folders, «Скрыть автора» and the comment field. VKgram only says what to forward.
 */

// a channel with «Ограничить сохранение контента» (and the like) cannot be forwarded: Web K says so
export async function canForwardPost(messages: Message.message[]) {
  const results = await Promise.all(messages.map((message) => rootScope.managers.appMessagesManager.canForward(message)));
  return results.every(Boolean);
}

export async function openForwardPopup(messages: Message.message[]) {
  const {default: showForwardPopup} = await import('@components/popups/forward');
  showForwardPopup({[messages[0].peerId]: messages.map((message) => message.mid)});
}

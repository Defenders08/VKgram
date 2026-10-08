import addAnchorListener from '@helpers/addAnchorListener';
import openTgLink from './openTgLink';
import {openVKChat} from '@/vkgram/pages/messages/openChat';

/**
 * Registers VKgram-side handlers for Telegram internal links so that
 * @username mentions and t.me/username links open inside our interface,
 * not in the original Telegram Web K messenger.
 */
export function registerVKgramTelegramLinkHandlers() {
  // Handles `t.me/username`, `t.me/c/...`, `t.me/s/...`, etc.
  addAnchorListener({
    name: 'im',
    callback: async({pathnameParams, uriParams, element}) => {
      // Message mention by user_id (messageEntityMentionName) uses data-follow
      const follow = (element as HTMLElement)?.dataset?.follow;
      if(follow) {
        try {
          const peerId = Number(follow).toPeerId(true);
          openVKChat(peerId);
          if(location.hash) history.replaceState(null, '', location.pathname + location.search);
          return;
        } catch{
          // Fall through to URL handling
        }
      }

      const url = element?.href ?? '';
      const handled = await openTgLink(url);
      if(handled) {
        if(location.hash) history.replaceState(null, '', location.pathname + location.search);
      } else {
        try {
          window.open(url, '_blank', 'noopener noreferrer');
        } catch{
          // Ignore
        }
      }
    }
  });

  // Invite links / join chats (`t.me/+...`, `t.me/joinchat`)
  addAnchorListener({
    name: 'joinchat',
    callback: async({pathnameParams, element}) => {
      const url = element?.href ?? '';
      const handled = await openTgLink(url);
      if(!handled) {
        try {
          window.open(url, '_blank', 'noopener noreferrer');
        } catch{
          // Ignore
        }
      }
    }
  });
}

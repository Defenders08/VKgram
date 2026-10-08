import {createMemo, createResource, createSignal} from 'solid-js';
import type {Message} from '@layer';
import MessageRenderer from '@/vkgram/components/MessageRenderer';
import createPostMenu from '@/vkgram/pages/channel/createPostMenu';
import {canForwardPost, openForwardPopup} from '@/vkgram/pages/channel/forwardPost';

/**
 * One publication of a channel. `messages` is one post: a single message, or
 * an album (several messages sharing a `grouped_id`) whose caption sits on
 * one of them. All numbers and flags come from the message itself.
 *
 * The ⋮ next to the author (and, on desktop, a right click on the post) opens
 * the post's menu — Telegram's actions through Web K (`createPostMenu`).
 * «Переслать» under the post opens Web K's forward popup (`forwardPost`).
 *
 * Теперь использует MessageRenderer — унифицированный компонент для отображения
 * сообщений как в чатах, так и в постах каналов.
 */
export default function VKChannelPost(props: {
  messages: Message.message[],
  isPinned?: boolean,
  // only the post itself: no reactions, comments or «Переслать» (the block of «Моя страница»)
  compact?: boolean
}) {
  const main = createMemo(() => props.messages.find((message) => message.message) ?? props.messages[0]);
  const [isCommentsOpen, setCommentsOpen] = createSignal(false);

  // «Переслать» is shown where Web K lets the post be forwarded (a channel can forbid it)
  const [canForward] = createResource(
    () => props.messages,
    (messages) => canForwardPost(messages).catch(() => false)
  );

  /**
   * Opens Web K's own media viewer (the one the chat and «Shared media» use) on
   * the message, with the same search context the chat gives it, so the viewer
   * pages through the channel's photos and videos by itself.
   */
  const handleMediaClick = async(message: Message.message, target?: HTMLElement) => {
    const {default: AppMediaViewer} = await import('@components/mediaViewer');
    new AppMediaViewer()
    .setSearchContext({
      peerId: message.peerId,
      inputFilter: {_: 'inputMessagesFilterPhotoVideo'},
      useSearch: true
    })
    .openMedia({message, target});
  };

  return (
    <MessageRenderer
      message={props.messages}
      variant="channel-post"
      isPinned={props.isPinned}
      showAvatar={true}
      showAuthor={true}
      showViews={true}
      showReactions={!props.compact}
      hideFooter={props.compact}
      showComments={!props.compact}
      isCommentsOpen={isCommentsOpen()}
      onCommentsToggle={() => setCommentsOpen((open) => !open)}
      onMediaClick={handleMediaClick}
      onForward={!props.compact && canForward() ? () => openForwardPopup(props.messages) : undefined}
      contextMenu={{
        onCreate: (element) => createPostMenu({
          element,
          getMessages: () => props.messages,
          getMain: main
        })
      }}
    />
  );
}

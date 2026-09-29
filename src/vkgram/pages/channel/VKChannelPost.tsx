import {createEffect, createMemo, For, onCleanup, Show} from 'solid-js';
import type {Message, Reaction} from '@layer';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import wrapRichText from '@richTextProcessor/wrapRichText';
import {getMiddleware} from '@helpers/middleware';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import formatNumber from '@helpers/number/formatNumber';
import {openWebKMessage} from '@/vkgram/webk';
import VKChannelPostMedia from '@/vkgram/pages/channel/VKChannelPostMedia';

const AVATAR_SIZE = 40;

/**
 * One publication of a channel. `messages` is one post: a single message, or
 * an album (several messages sharing a `grouped_id`) whose caption sits on
 * one of them. All numbers and flags come from the message itself.
 */
export default function VKChannelPost(props: {
  messages: Message.message[],
  isPinned?: boolean
}) {
  const peers = usePeers();
  // the message that carries the post's text, views and reactions
  const main = createMemo(() => props.messages.find((message) => message.message) ?? props.messages[0]);
  const chat = () => peers[main().peerId] as {title?: string};

  const forwardedFrom = () => {
    const fwd = main().fwd_from;
    return fwd ? (fwd.from_name || fwd.post_author || '') : undefined;
  };

  const time = () => formatDateAccordingToTodayNew(new Date(main().date * 1000));
  const commentsCount = () => main().replies?.pFlags?.comments ? main().replies.replies : undefined;
  const reactions = () => (main().reactions?.results || []).filter((result) => result.count > 0);

  let textEl: HTMLDivElement;
  createEffect(() => {
    const message = main();
    const middlewareHelper = getMiddleware();
    onCleanup(() => middlewareHelper.destroy());

    textEl.replaceChildren(
      message.message ?
        wrapRichText(message.message, {
          entities: message.totalEntities ?? message.entities,
          middleware: middlewareHelper.get()
        }) :
        ''
    );
  });

  return (
    <article class="vk-channel-post" data-mid={main().mid}>
      <header class="vk-channel-post-header">
        <AvatarNewTsx peerId={main().peerId} size={AVATAR_SIZE} />
        <div class="vk-channel-post-author">
          <span class="vk-channel-post-name">{chat()?.title}</span>
          <span class="vk-channel-post-date vk-page-text-secondary">
            {time()}
            <Show when={main().post_author}>{' · '}{main().post_author}</Show>
            <Show when={main().edit_date && !main().pFlags.edit_hide}>{' · изменено'}</Show>
            <Show when={props.isPinned}>{' · закреплено'}</Show>
          </span>
        </div>
      </header>

      <Show when={forwardedFrom() !== undefined}>
        <div class="vk-channel-post-forward vk-page-text-secondary">
          Репост{forwardedFrom() ? `: ${forwardedFrom()}` : ''}
        </div>
      </Show>

      <div class="vk-channel-post-content vk-page-text" ref={textEl} />

      <For each={props.messages}>
        {(message) => <VKChannelPostMedia message={message} />}
      </For>

      <footer class="vk-channel-post-meta vk-page-text-secondary">
        <Show when={main().views}>
          <span title="Просмотры">👁 {formatNumber(main().views, 1)}</span>
        </Show>
        <Show when={commentsCount() !== undefined}>
          <span title="Комментарии">💬 {commentsCount()}</span>
        </Show>
        <For each={reactions()}>
          {(result) => (
            <span class="vk-channel-post-reaction" title="Реакции">
              {getReactionGlyph(result.reaction)} {formatNumber(result.count, 1)}
            </span>
          )}
        </For>
        <button
          type="button"
          class="vk-link-button vk-channel-post-open"
          onClick={() => openWebKMessage(main().peerId, main().mid)}
        >
          Открыть в «Сообщениях»
        </button>
      </footer>
    </article>
  );
}

// only what the reaction itself says: an emoji, or the paid star; a custom
// emoji has no text form here, so just its count is shown
function getReactionGlyph(reaction: Reaction) {
  if(reaction._ === 'reactionEmoji') return reaction.emoticon;
  if(reaction._ === 'reactionPaid') return '⭐';
  return '';
}

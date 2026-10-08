import {createEffect, createMemo, createResource, createSignal, For, onCleanup, Show} from 'solid-js';
import type {Chat, Message} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import wrapRichText from '@richTextProcessor/wrapRichText';
import {getMiddleware} from '@helpers/middleware';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';

type Comment = Message.message;

function CommentText(props: {message: Comment}) {
  let textEl: HTMLDivElement;
  createEffect(() => {
    const message = props.message;
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
  return <div class="vk-comment-text vk-page-text" ref={textEl} />;
}

/**
 * The thread of one comment section: the comments of the discussion message,
 * read through Web K's own history call (`getHistory({threadId})`, wrapped by
 * createChannelHistory), the answers shown as «в ответ …», a form that sends
 * through `appMessagesManager.sendText` into the same thread.
 */
function VKCommentsThread(props: {root: Message.message}) {
  const peers = usePeers();
  const peerId = () => props.root.peerId;
  const threadId = () => props.root.mid;

  const history = createChannelHistory({peerId, threadId: threadId(), pageSize: 20});
  // the history is newest first, a conversation reads oldest first
  const comments = createMemo(() => history.messages().slice().reverse() as Comment[]);
  const byMid = createMemo(() => new Map(comments().map((comment) => [comment.mid, comment])));

  const authorId = (comment: Comment) => (comment.fromId ?? comment.peerId) as PeerId;
  const authorName = (peerId: PeerId) => {
    const peer = peers[peerId] as {title?: string, first_name?: string, last_name?: string};
    return peer?.title ?? [peer?.first_name, peer?.last_name].filter(Boolean).join(' ');
  };
  const replyTarget = (comment: Comment) => {
    const id = (comment.reply_to as {reply_to_msg_id?: number})?.reply_to_msg_id;
    return id && id !== threadId() ? byMid().get(id) : undefined;
  };

  // * may I write here: rights in the discussion group; not a member → «Вступить»
  const group = () => peers[peerId()] as Chat.channel | undefined;
  const [canWrite, {refetch: recheckCanWrite}] = createResource(async() => {
    try {
      return await rootScope.managers.appMessagesManager.canSendToPeer(peerId(), threadId());
    } catch(err) {
      return false;
    }
  });
  const [isJoining, setJoining] = createSignal(false);
  const join = async() => {
    setJoining(true);
    try {
      await rootScope.managers.appChatsManager.joinChannel(peerId().toChatId());
      await recheckCanWrite();
    } catch(err) {
      console.error('VKgram: joinChannel failed', err);
    } finally {
      setJoining(false);
    }
  };

  // * the form
  const [text, setText] = createSignal('');
  const [replyTo, setReplyTo] = createSignal<Comment>();
  const [isSending, setSending] = createSignal(false);
  const [sendError, setSendError] = createSignal(false);
  let inputEl: HTMLTextAreaElement;

  const send = async() => {
    const value = text().trim();
    if(!value || isSending()) return;

    setSending(true);
    setSendError(false);
    try {
      await rootScope.managers.appMessagesManager.sendText({
        peerId: peerId(),
        threadId: threadId(),
        replyToMsgId: replyTo()?.mid ?? threadId(),
        text: value
      });
      setText('');
      setReplyTo(undefined);
    } catch(err) {
      console.error('VKgram: sending a comment failed', err);
      setSendError(true);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div class="vk-comments-thread">
      <Show when={history.status() === 'loading'}>
        <p class="vk-page-text vk-page-text-secondary">Загрузка комментариев…</p>
      </Show>

      <Show when={history.status() === 'error'}>
        <p class="vk-page-text vk-page-text-secondary">
          Не удалось загрузить комментарии.{' '}
          <button type="button" class="vk-link-button" onClick={() => history.reload()}>Повторить</button>
        </p>
      </Show>

      <Show when={history.status() === 'loaded'}>
        <Show when={!history.isEnd()}>
          <button
            type="button"
            class="vk-link-button vk-comments-older"
            disabled={history.isLoadingMore()}
            onClick={() => history.loadMore()}
          >
            {history.isLoadingMore() ? 'Загрузка…' : 'Показать предыдущие комментарии'}
          </button>
        </Show>

        <ul class="vk-comments-list">
          <For each={comments()} fallback={<li class="vk-page-text vk-page-text-secondary">Комментариев пока нет.</li>}>
            {(comment) => (
              <li class="vk-comment" data-mid={comment.mid}>
                <AvatarNewTsx peerId={authorId(comment)} size={28} />
                <div class="vk-comment-body">
                  <div class="vk-comment-head">
                    <span class="vk-comment-author">{authorName(authorId(comment))}</span>
                    <span class="vk-comment-date vk-page-text-secondary">
                      {formatDateAccordingToTodayNew(new Date(comment.date * 1000))}
                      <Show when={comment.edit_date && !comment.pFlags.edit_hide}>{' · изменено'}</Show>
                    </span>
                  </div>

                  <Show when={replyTarget(comment)}>
                    {(target) => (
                      <div class="vk-comment-reply-to vk-page-text-secondary">
                        в ответ {authorName(authorId(target()))}
                      </div>
                    )}
                  </Show>

                  <CommentText message={comment} />

                  <Show when={comment.media && comment.media._ !== 'messageMediaEmpty'}>
                    <button
                      type="button"
                      class="vk-link-button"
                      onClick={() => openVKChat(comment.peerId, {mid: comment.mid, kind: 'jump'})}
                    >
                      Показать вложение в чате
                    </button>
                  </Show>

                  <Show when={canWrite()}>
                    <button
                      type="button"
                      class="vk-link-button vk-comment-reply"
                      onClick={() => {
                        setReplyTo(comment);
                        inputEl?.focus();
                      }}
                    >
                      Ответить
                    </button>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={!canWrite.loading}>
        <Show
          when={canWrite()}
          fallback={
            <Show
              when={group()?.pFlags?.left}
              fallback={<p class="vk-page-text vk-page-text-secondary">Писать комментарии здесь нельзя.</p>}
            >
              <button type="button" class="vk-button vk-button-secondary" disabled={isJoining()} onClick={join}>
                {isJoining() ? 'Вступаем…' : 'Вступить в обсуждение, чтобы комментировать'}
              </button>
            </Show>
          }
        >
          <form class="vk-comment-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <Show when={replyTo()}>
              {(target) => (
                <div class="vk-comment-form-reply vk-page-text-secondary">
                  Ответ: {authorName(authorId(target()))}
                  <button type="button" class="vk-link-button" aria-label="Отменить ответ" onClick={() => setReplyTo(undefined)}>✕</button>
                </div>
              )}
            </Show>
            <textarea
              ref={inputEl}
              class="vk-comment-input"
              rows="1"
              placeholder="Комментарий"
              aria-label="Комментарий"
              value={text()}
              disabled={isSending()}
              onInput={(e) => setText(e.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" class="vk-button" disabled={isSending() || !text().trim()}>
              {isSending() ? 'Отправка…' : 'Отправить'}
            </button>
            <Show when={sendError()}>
              <span class="vk-page-text-secondary">Не удалось отправить.</span>
            </Show>
          </form>
        </Show>
      </Show>
    </div>
  );
}

/**
 * The comments of a post, opened inside the post itself (no page of their
 * own). The discussion message comes from `getDiscussionMessage`: it lives in
 * the linked discussion group, and its mid is the thread id of the comments.
 */
export default function VKChannelPostComments(props: {message: Message.message}) {
  const [root] = createResource(
    () => ({peerId: props.message.peerId, mid: props.message.mid}),
    async({peerId, mid}) => {
      try {
        return await rootScope.managers.appMessagesManager.getDiscussionMessage(peerId, mid) as Message.message | undefined;
      } catch(err) {
        console.error('VKgram: getDiscussionMessage failed', err);
      }
    }
  );

  return (
    <div class="vk-comments">
      <Show when={!root.loading} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка комментариев…</p>}>
        <Show when={root()} fallback={<p class="vk-page-text vk-page-text-secondary">Комментарии недоступны.</p>}>
          {(discussion) => <VKCommentsThread root={discussion()} />}
        </Show>
      </Show>
    </div>
  );
}

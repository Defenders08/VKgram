import {createEffect, createMemo, createResource, createSignal, For, onCleanup, Show} from 'solid-js';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import VKChannelPost from '@/vkgram/pages/channel/VKChannelPost';

type Post = {id: number, messages: Message.message[]};

/**
 * The messages of a channel as publications: the several messages of an album
 * (same `grouped_id`, next to each other) are one post.
 */
function groupPosts(messages: Message.message[]) {
  const posts: Post[] = [];
  for(const message of messages) {
    const last = posts[posts.length - 1];
    if(last && message.grouped_id && last.messages[0].grouped_id === message.grouped_id) {
      last.messages.push(message);
    } else {
      posts.push({id: message.mid, messages: [message]});
    }
  }

  // the feed is newest first, an album reads oldest first
  posts.forEach((post) => post.messages.reverse());
  return posts;
}

/**
 * «Записи» tab of «Лента» — the pinned post (Web K's pinned message of the channel) and
 * the feed: the latest posts first, older ones as the end of the list comes
 * near (an IntersectionObserver on a sentinel — no scroll listeners).
 */
export default function VKChannelPosts(props: {
  peerId: PeerId,
  pinnedMessageId?: number,
  // reports the total to the tab label of «Лента»
  onCount?: (count: number | undefined) => void
}) {
  const history = createChannelHistory({peerId: () => props.peerId});
  createEffect(() => props.onCount?.(history.count()));
  const grouped = createMemo(() => groupPosts(history.messages().filter(m => m._ === 'message') as Message.message[]));
  // The list is keyed by the ids only, so a page of older posts (or a new view
  // count) doesn't re-create the posts already on screen along with their media.
  const postIds = createMemo(() => grouped().map((post) => post.id), [], {
    equals: (a, b) => a.length === b.length && a.every((id, index) => id === b[index])
  });
  const postsById = createMemo(() => new Map(grouped().map((post) => [post.id, post])));

  // the pinned post: Web K knows the newest pin (`getPinnedMessage`), the message itself comes from its storage
  const [pinned] = createResource(
    () => ({peerId: props.peerId, hint: props.pinnedMessageId}),
    async({peerId}) => {
      try {
        const {maxId} = await rootScope.managers.appMessagesManager.getPinnedMessage(peerId);
        if(!maxId) return;
        const message = await rootScope.managers.appMessagesManager.getMessageByPeer(peerId, maxId);
        return message?._ === 'message' ? message : undefined;
      } catch(err) {
        console.error('VKgram: failed to load the pinned post', err);
      }
    }
  );

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  createEffect(() => {
    const element = sentinel();
    if(!element || history.status() !== 'loaded' || history.isEnd()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) history.loadMore();
    }, {rootMargin: '400px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="vk-channel-posts">
      <Show when={pinned.latest}>
        <div class="vk-channel-pinned">
          <h3 class="vk-channel-subtitle">Закреплённая публикация</h3>
          <VKChannelPost messages={[pinned.latest]} isPinned />
        </div>
      </Show>

      <Show when={history.status() === 'loading'}>
        <p class="vk-page-text vk-page-text-secondary">Загрузка публикаций…</p>
      </Show>

      <Show when={history.status() === 'error'}>
        <p class="vk-page-text vk-page-text-secondary">
          Не удалось загрузить публикации.{' '}
          <button type="button" class="vk-link-button" onClick={() => history.reload()}>Повторить</button>
        </p>
      </Show>

      <Show when={history.status() === 'loaded'}>
        <Show
          when={postIds().length}
          fallback={<p class="vk-page-text vk-page-text-secondary">Нет публикаций.</p>}
        >
          <For each={postIds()}>
            {(id) => (
              <Show when={postsById().get(id)}>
                {(post) => <VKChannelPost messages={post().messages} />}
              </Show>
            )}
          </For>
          <div ref={setSentinel} class="vk-list-sentinel" />
          <Show when={history.isLoadingMore()}>
            <p class="vk-page-text vk-page-text-secondary">Загрузка публикаций…</p>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

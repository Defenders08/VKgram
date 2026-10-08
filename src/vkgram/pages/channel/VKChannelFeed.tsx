import {createSignal, For, Show} from 'solid-js';
import formatNumber from '@helpers/number/formatNumber';
import VKChannelMedia from '@/vkgram/pages/channel/VKChannelMedia';
import VKChannelPosts from '@/vkgram/pages/channel/VKChannelPosts';

type VKChannelFeedTab = 'posts' | 'media';

const TABS: {id: VKChannelFeedTab, title: string}[] = [
  {id: 'posts', title: 'Записи'},
  {id: 'media', title: 'Медиа'}
];

/**
 * «Лента» of a channel: one block with two tabs — «Записи» (the posts) and
 * «Медиа» (what used to be a block of its own). Both panels stay mounted, the
 * inactive one is only hidden, so the loaded posts and the scroll position
 * of the list survive a tab switch.
 */
export default function VKChannelFeed(props: {peerId: PeerId, pinnedMessageId?: number}) {
  const [tab, setTab] = createSignal<VKChannelFeedTab>('posts');
  const [postsCount, setPostsCount] = createSignal<number>();

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = TABS[(TABS.findIndex((item) => item.id === tab()) + 1) % TABS.length];
    setTab(next.id);
    document.getElementById(`vk-channel-feed-tab-${next.id}`)?.focus();
  };

  return (
    <section class="vk-block vk-channel-feed" aria-label="Лента">
      <h2 class="vk-block-title">Лента</h2>

      <div class="vk-tabs" role="tablist" onKeyDown={onKeyDown}>
        <For each={TABS}>
          {(item) => (
            <button
              type="button"
              id={`vk-channel-feed-tab-${item.id}`}
              class="vk-tab"
              classList={{'is-active': tab() === item.id}}
              role="tab"
              aria-selected={tab() === item.id}
              aria-controls={`vk-channel-feed-panel-${item.id}`}
              tabindex={tab() === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
            >
              {item.title}
              <Show when={item.id === 'posts' && postsCount()}>
                <span class="vk-tab-count"> {formatNumber(postsCount(), 1)}</span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <div
        id="vk-channel-feed-panel-posts"
        role="tabpanel"
        aria-labelledby="vk-channel-feed-tab-posts"
        hidden={tab() !== 'posts'}
      >
        <VKChannelPosts peerId={props.peerId} pinnedMessageId={props.pinnedMessageId} onCount={setPostsCount} />
      </div>

      <div
        id="vk-channel-feed-panel-media"
        role="tabpanel"
        aria-labelledby="vk-channel-feed-tab-media"
        hidden={tab() !== 'media'}
      >
        <VKChannelMedia peerId={props.peerId} kind="media" embedded />
      </div>
    </section>
  );
}

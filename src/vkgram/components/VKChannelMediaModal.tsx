import {onCleanup, onMount, Show} from 'solid-js';
import type {Message} from '@layer';
import formatNumber from '@helpers/number/formatNumber';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import {KINDS, VKChannelMediaItems, VKChannelMaterialsKind} from '@/vkgram/pages/channel/VKChannelMedia';
import VKModal from '@/vkgram/components/VKModal';

/**
 * «Показать все» of a channel's materials block («Файлы», «Ссылки», «Музыка»,
 * «Медиа») in a `VKModal`: the whole list of the same server-side filter the
 * block previews (`createChannelHistory`, `messages.search` for the peer),
 * paged as the sentinel comes into view, laid out like the block itself.
 */
export default function VKChannelMediaModal(props: {
  peerId: PeerId,
  kind: VKChannelMaterialsKind,
  total?: number,
  onClose: () => void
}) {
  const config = KINDS[props.kind];
  const history = createChannelHistory({
    peerId: () => props.peerId,
    inputFilter: config.filter,
    pageSize: 40
  });

  const title = () => `${config.title}${history.count() ? ` ${formatNumber(history.count()!, 1)}` : ''}`;

  // the next page loads when the sentinel shows up at the bottom of the list
  let sentinel!: HTMLDivElement;
  onMount(() => {
    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) history.loadMore();
    });
    observer.observe(sentinel);
    onCleanup(() => observer.disconnect());
  });

  const width = config.layout === 'grid' ? 560 : 440;

  const shownCount = () => (history.messages().filter(m => (m as any)._ === 'message') as Message.message[]).length;

  return (
    <VKModal title={title()} width={width} onClose={props.onClose}>
      <div class="vk-modal-body vk-channel-media-modal">
        <VKChannelMediaItems kind={props.kind} messages={history.messages().filter(m => m._ === 'message') as Message.message[]} />

        <Show when={history.isLoadingMore()}>
          <p class="vk-page-text vk-page-text-secondary vk-channel-media-loading">Загрузка…</p>
        </Show>

        <Show when={!history.isEnd()}>
          <div class="vk-list-sentinel" ref={sentinel} />
        </Show>

        <Show when={history.isEnd() && props.total !== undefined && history.count() !== props.total}>
          <p class="vk-page-text vk-page-text-secondary vk-channel-media-loading">
            Показаны последние {shownCount()} из {props.total}.
          </p>
        </Show>
      </div>
    </VKModal>
  );
}

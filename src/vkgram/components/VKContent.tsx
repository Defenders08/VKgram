import {Component, createEffect, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import type {VKSectionId} from '@/vkgram/sections';
import VKPageMessages from '@/vkgram/pages/VKPageMessages';
import VKPageTelegram from '@/vkgram/pages/VKPageTelegram';
import VKPageProfile from '@/vkgram/pages/VKPageProfile';
import VKPageNews from '@/vkgram/pages/VKPageNews';
import VKPageFriends from '@/vkgram/pages/VKPageFriends';
import VKPageGroups from '@/vkgram/pages/VKPageGroups';
import VKPageChannels from '@/vkgram/pages/VKPageChannels';
import VKPageAudio from '@/vkgram/pages/VKPageAudio';
import VKPagePhotos from '@/vkgram/pages/VKPagePhotos';
import VKPageVideos from '@/vkgram/pages/VKPageVideos';
import VKPageDocs from '@/vkgram/pages/VKPageDocs';
import VKPageApps from '@/vkgram/pages/VKPageApps';
import VKPageSettings from '@/vkgram/pages/VKPageSettings';

// Sections mounted on demand. «Телеграм» and «Сообщения» aren't here: they have their own branches below
// (the Web K shell is attached only while «Телеграм» is on screen, and is out of the page otherwise).
const PAGES: {[id in Exclude<VKSectionId, 'telegram' | 'messages'>]: Component} = {
  profile: VKPageProfile,
  news: VKPageNews,
  friends: VKPageFriends,
  groups: VKPageGroups,
  channels: VKPageChannels,
  audio: VKPageAudio,
  photos: VKPagePhotos,
  videos: VKPageVideos,
  docs: VKPageDocs,
  apps: VKPageApps,
  settings: VKPageSettings
};

/**
 * Main content area: shows the current section. Only this part changes on
 * navigation — header and sidebar / mobile nav stay as they are.
 */
export default function VKContent(props: {
  section: VKSectionId,
  // holder of the existing Web K / Telegram shell (`#page-chats`)
  telegramHost?: HTMLElement
}) {
  let main: HTMLElement | undefined;

  // A scrolled page goes under the top edge of the area, and the blocks that reach it are cut there.
  // Each of them gets a thin line along the cut — only as wide as the block itself, not across the
  // gaps between blocks or the menu — so the cut reads as the border of a block, not as a tear.
  // On desktop the DOCUMENT is the scroller and the cut is the sticky header's bottom edge; on
  // mobile (and in the «Сообщения»/«Телеграм» panes) an inner `.vk-page` scrolls and the cut is
  // the top of the content area — `Math.max` of the two covers both. The lines are `position:
  // fixed`, so their `top` is the same viewport `y` for every block. `scroll` does not bubble —
  // hence the capture listener; the window needs its own listener (its scroll target is the
  // document). The segments are measured again on every scroll (one frame at a time), on a
  // resize, and when the page is replaced by another one.
  const [edgeSegments, setEdgeSegments] = createSignal<{left: number, top: number, width: number}[]>([]);
  let frame = 0;

  const measure = () => {
    frame = 0;
    if(!main) return;
    const header = document.querySelector('.vk-header');
    const edgeY = Math.max(
      main.getBoundingClientRect().top,
      header ? header.getBoundingClientRect().bottom : 0
    );
    const segments: {left: number, top: number, width: number}[] = [];
    main.querySelectorAll<HTMLElement>('.vk-page .vk-block').forEach((block) => {
      const rect = block.getBoundingClientRect();
      // the top border of the block is above the edge, the block itself still reaches it
      if(rect.top < edgeY && rect.bottom > edgeY + 1 && rect.width) {
        segments.push({left: Math.round(rect.left), top: Math.round(edgeY), width: Math.round(rect.width)});
      }
    });
    // a block inside a block of the same place and width is one line, not two
    const unique = segments.filter((segment, index) => {
      return segments.findIndex((other) => other.left === segment.left && other.width === segment.width) === index;
    });
    setEdgeSegments((prev) => {
      const same = prev.length === unique.length && prev.every((item, index) => {
        return item.left === unique[index].left && item.top === unique[index].top && item.width === unique[index].width;
      });
      return same ? prev : unique;
    });
  };
  const schedule = () => {
    if(!frame) frame = requestAnimationFrame(measure);
  };

  const onScroll = (event: Event) => {
    const element = event.target;
    // the window (its target is the document) or an inner page pane
    if(element === document || element === document.documentElement) {
      schedule();
      return;
    }
    if(element instanceof HTMLElement && element.classList.contains('vk-page')) schedule();
  };

  onMount(() => {
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', schedule);
    // a page replaced by another one (a channel opened in «Каналы») is at its top again
    const observer = new MutationObserver(schedule);
    observer.observe(main, {childList: true, subtree: true});

    onCleanup(() => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
      if(frame) cancelAnimationFrame(frame);
    });
  });

  // another section is another page: nothing is scrolled yet
  createEffect(on(() => props.section, () => {
    setEdgeSegments([]);
    schedule();
  }, {defer: true}));

  const page = () => (props.section === 'telegram' || props.section === 'messages') ? undefined : PAGES[props.section];

  return (
    <main
      class="vk-content"
      classList={{'is-app': props.section === 'messages' || props.section === 'telegram'}}
      ref={main}
    >
      <Show when={props.section === 'messages'}>
        <VKPageMessages />
      </Show>
      <Show when={props.section === 'telegram'}>
        <VKPageTelegram host={props.telegramHost} active={props.section === 'telegram'} />
      </Show>
      <Show when={page()}>
        <Dynamic component={page()} />
      </Show>
      <For each={edgeSegments()}>
        {(segment) => (
          <div
            class="vk-edge-line"
            style={{left: segment.left + 'px', top: segment.top + 'px', width: segment.width + 'px'}}
          />
        )}
      </For>
    </main>
  );
}

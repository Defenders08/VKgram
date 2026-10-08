import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import VKHeader from '@/vkgram/components/VKHeader';
import VKMobileNav, {VK_MOBILE_MORE_ID} from '@/vkgram/components/VKMobileNav';
import VKSidebar from '@/vkgram/components/VKSidebar';
import VKContent from '@/vkgram/components/VKContent';
import type {VKLayoutProps} from '@/vkgram/layouts/VKDesktopLayout';
import type {VKSectionId} from '@/vkgram/sections';
import {vkMessagePeerId} from '@/vkgram/pages/messages/route';

// as long as the leaving of the drawer (see `vk-drawer-out`): it stays in the page that long
const DRAWER_CLOSE_DELAY = 200;

/**
 * Mobile structure: compact header, content area, bottom navigation.
 * Not a CSS-shrunk desktop — no sidebar here at all. Sections that don't fit
 * the bottom bar are in the side menu: the header's ☰ slides it in over the
 * content — the drawer variant of the sidebar (a profile header over the list
 * with icons, the mini player under the header while something plays, «Выйти»
 * as its last item; desktop has «Выйти» in the header).
 */
export default function VKMobileLayout(props: VKLayoutProps) {
  // `isMoreOpen` is the choice, `isDrawerMounted` is the drawer in the page: it stays a moment
  // after the closing to be seen leaving (the backdrop fades, the panel slides back)
  const [isMoreOpen, setIsMoreOpen] = createSignal(false);
  const [isDrawerMounted, setIsDrawerMounted] = createSignal(false);

  createEffect(() => {
    if(isMoreOpen()) {
      setIsDrawerMounted(true);
      return;
    }
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : DRAWER_CLOSE_DELAY;
    const timeout = window.setTimeout(() => setIsDrawerMounted(false), delay);
    onCleanup(() => window.clearTimeout(timeout));
  });

  const selectSection = (id: VKSectionId) => {
    setIsMoreOpen(false);
    props.onSectionChange(id);
  };

  const toggleMore = () => setIsMoreOpen((open) => !open);

  // an open dialog takes the whole screen: the bottom bar is out of the way (the dialog's «Чаты»
  // and the browser's Back lead to the list, where the bar returns)
  const isNavHidden = () => props.section === 'messages' && vkMessagePeerId() !== undefined;

  return (
    <div class="vk-mobile-layout" classList={{'is-nav-hidden': isNavHidden()}}>
      <VKHeader
        variant="mobile"
        section={props.section}
        isMenuActive={isMoreOpen()}
        menuControls={VK_MOBILE_MORE_ID}
        onMenuClick={toggleMore}
      />
      <div class="vk-mobile-body">
        <VKContent section={props.section} telegramHost={props.telegramHost} />
        <Show when={isDrawerMounted()}>
          <div class="vk-mobile-drawer-layer" classList={{'is-closing': !isMoreOpen()}}>
            <div class="vk-mobile-backdrop" onClick={() => setIsMoreOpen(false)} />
            <aside
              id={VK_MOBILE_MORE_ID}
              class="vk-mobile-drawer"
              aria-label="Меню"
              ref={(el) => queueMicrotask(() => el.querySelector<HTMLElement>('.vk-sidebar button')?.focus({preventScroll: true}))}
              onKeyDown={(e) => {
                if(e.key === 'Escape') {
                  e.stopPropagation();
                  setIsMoreOpen(false);
                }
              }}
            >
              <VKSidebar active={props.section} onSectionChange={selectSection} withLogout variant="drawer" />
            </aside>
          </div>
        </Show>
      </div>
      <Show when={!isNavHidden()}>
        <VKMobileNav active={props.section} onSectionChange={selectSection} />
      </Show>
    </div>
  );
}

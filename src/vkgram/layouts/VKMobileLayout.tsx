import {createSignal, For, Show} from 'solid-js';
import VKHeader from '@/vkgram/components/VKHeader';
import VKMobileNav, {VK_MOBILE_MORE_ID, VK_MOBILE_MORE_SECTIONS} from '@/vkgram/components/VKMobileNav';
import VKContent from '@/vkgram/components/VKContent';
import VKIcon from '@/vkgram/components/VKIcons';
import type {VKLayoutProps} from '@/vkgram/layouts/VKDesktopLayout';
import type {VKSectionId} from '@/vkgram/sections';

/**
 * Mobile structure: compact header, content area, bottom navigation.
 * Not a CSS-shrunk desktop — no sidebar here at all. Sections that don't fit
 * the bottom bar are listed behind «Ещё» (also the header's ☰).
 */
export default function VKMobileLayout(props: VKLayoutProps) {
  const [isMoreOpen, setIsMoreOpen] = createSignal(false);

  const selectSection = (id: VKSectionId) => {
    setIsMoreOpen(false);
    props.onSectionChange(id);
  };

  const toggleMore = () => setIsMoreOpen((open) => !open);

  return (
    <div class="vk-mobile-layout">
      <VKHeader
        variant="mobile"
        isMenuActive={isMoreOpen()}
        menuControls={VK_MOBILE_MORE_ID}
        onMenuClick={toggleMore}
      />
      <div class="vk-mobile-body">
        <VKContent section={props.section} messagesHost={props.messagesHost} />
        <Show when={isMoreOpen()}>
          <nav
            id={VK_MOBILE_MORE_ID}
            class="vk-mobile-more vk-block"
            aria-label="Ещё"
            onKeyDown={(e) => {
              if(e.key === 'Escape') {
                e.stopPropagation();
                setIsMoreOpen(false);
              }
            }}
          >
            <ul class="vk-sidebar-list">
              <For each={VK_MOBILE_MORE_SECTIONS}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      class="vk-sidebar-item"
                      classList={{'is-active': props.section === item.id}}
                      aria-current={props.section === item.id ? 'page' : undefined}
                      onClick={() => selectSection(item.id)}
                    >
                      <VKIcon name={item.icon} size={16} class="vk-sidebar-item-icon" />
                      <span class="vk-sidebar-item-text">{item.title}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </nav>
        </Show>
      </div>
      <VKMobileNav
        active={props.section}
        onSectionChange={selectSection}
        isMoreOpen={isMoreOpen()}
        onMoreToggle={toggleMore}
      />
    </div>
  );
}

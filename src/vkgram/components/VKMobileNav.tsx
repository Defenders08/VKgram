import {For} from 'solid-js';
import {getVKSections, VKSectionId} from '@/vkgram/sections';
import VKIcon from '@/vkgram/components/VKIcons';

export const VK_MOBILE_NAV_SECTIONS = getVKSections(['news', 'messages', 'friends']);
// «Моя страница» is the header avatar; the rest lives behind «Ещё»
export const VK_MOBILE_MORE_SECTIONS = getVKSections(['groups', 'channels', 'settings']);

export const VK_MOBILE_MORE_ID = 'vk-mobile-more';

export type VKMobileNavProps = {
  active: VKSectionId,
  onSectionChange: (id: VKSectionId) => void,
  isMoreOpen: boolean,
  onMoreToggle: () => void
};

/**
 * Bottom navigation of the mobile layout — a separate component from the
 * desktop sidebar, driven by the same section state.
 */
export default function VKMobileNav(props: VKMobileNavProps) {
  const isMoreActive = () => props.isMoreOpen ||
    VK_MOBILE_MORE_SECTIONS.some((section) => section.id === props.active);

  return (
    <nav class="vk-mobile-nav" aria-label="Навигация">
      <For each={VK_MOBILE_NAV_SECTIONS}>
        {(item) => (
          <button
            type="button"
            class="vk-mobile-nav-item"
            classList={{'is-active': !props.isMoreOpen && props.active === item.id}}
            aria-current={props.active === item.id ? 'page' : undefined}
            onClick={() => props.onSectionChange(item.id)}
          >
            <VKIcon name={item.icon} size={20} class="vk-mobile-nav-item-icon" />
            <span class="vk-mobile-nav-item-text">{item.title}</span>
          </button>
        )}
      </For>
      <button
        type="button"
        class="vk-mobile-nav-item"
        classList={{'is-active': isMoreActive()}}
        aria-expanded={props.isMoreOpen}
        aria-controls={VK_MOBILE_MORE_ID}
        onClick={() => props.onMoreToggle()}
      >
        <VKIcon name="more" size={20} class="vk-mobile-nav-item-icon" />
        <span class="vk-mobile-nav-item-text">Ещё</span>
      </button>
    </nav>
  );
}

import {For, Show} from 'solid-js';
import {getVKSections, VKSectionId} from '@/vkgram/sections';
import VKIcon from '@/vkgram/components/VKIcons';
import createMessagesUnread, {formatUnreadBadge} from '@/vkgram/hooks/createMessagesUnread';
import {vkMobileNavSettings} from '@/vkgram/pages/settings/mobileNav';

// the id of the side menu the header's ☰ opens
export const VK_MOBILE_MORE_ID = 'vk-mobile-more';

export type VKMobileNavProps = {
  active: VKSectionId,
  onSectionChange: (id: VKSectionId) => void
};

/**
 * Bottom navigation of the mobile layout — a separate component from the
 * desktop sidebar, driven by the same section state. The tabs are the user's
 * choice («Настройки» → «Навбар»), each an icon over its name; the unread
 * number of the dialogs sits on the icon of «Сообщения», wherever it stands.
 * The side menu is not here: it belongs to the ☰ of the header.
 */
export default function VKMobileNav(props: VKMobileNavProps) {
  const messagesUnread = createMessagesUnread();
  const getBadge = (id: VKSectionId) => id === 'messages' && messagesUnread().count > 0 ? messagesUnread() : undefined;
  // the config section guarantees whole, known section ids
  const sections = () => getVKSections(vkMobileNavSettings().sections);

  return (
    <nav class="vk-mobile-nav" aria-label="Навигация">
      <For each={sections()}>
        {(item) => (
          <button
            type="button"
            class="vk-mobile-nav-item"
            classList={{'is-active': props.active === item.id}}
            aria-current={props.active === item.id ? 'page' : undefined}
            onClick={() => props.onSectionChange(item.id)}
          >
            <span class="vk-mobile-nav-item-glyph">
              <VKIcon name={item.icon} size={22} class="vk-mobile-nav-item-icon" />
              <Show when={getBadge(item.id)}>
                {(badge) => (
                  <span class="vk-mobile-nav-item-badge" classList={{'is-muted': badge().isMuted}}>
                    {formatUnreadBadge(badge().count)}
                  </span>
                )}
              </Show>
            </span>
            <span class="vk-mobile-nav-item-text">{item.title}</span>
          </button>
        )}
      </For>
    </nav>
  );
}

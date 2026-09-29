import {For, Show} from 'solid-js';
import type {User} from '@layer';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import {getVKSections, VKSection, VKSectionId} from '@/vkgram/sections';
import VKIcon from '@/vkgram/components/VKIcons';

// «Моя страница» is the me-card on top, not a row in the list
const MAIN_SECTIONS = getVKSections(['news', 'messages', 'friends', 'groups', 'channels']);
const BOTTOM_SECTIONS = getVKSections(['settings']);

export type VKSidebarProps = {
  active: VKSectionId,
  onSectionChange: (id: VKSectionId) => void
};

/**
 * Desktop left menu in the old VK shape: the me-card («Моя страница») on top,
 * the sections under it, settings below a divider. Reports the chosen section
 * up — the layout decides what to show.
 */
export default function VKSidebar(props: VKSidebarProps) {
  const user = useUser(() => rootScope.myId.toUserId()) as () => User.user;
  const fullName = () => [user()?.first_name, user()?.last_name].filter(Boolean).join(' ');

  const renderItems = (items: VKSection[]) => (
    <ul class="vk-sidebar-list">
      <For each={items}>
        {(item) => (
          <li>
            <button
              type="button"
              class="vk-sidebar-item"
              classList={{'is-active': props.active === item.id}}
              aria-current={props.active === item.id ? 'page' : undefined}
              onClick={() => props.onSectionChange(item.id)}
            >
              <VKIcon name={item.icon} size={16} class="vk-sidebar-item-icon" />
              <span class="vk-sidebar-item-text">{item.title}</span>
            </button>
          </li>
        )}
      </For>
    </ul>
  );

  return (
    <nav class="vk-sidebar" aria-label="Главное меню">
      <button
        type="button"
        class="vk-sidebar-me"
        classList={{'is-active': props.active === 'profile'}}
        aria-current={props.active === 'profile' ? 'page' : undefined}
        onClick={() => props.onSectionChange('profile')}
      >
        <AvatarNewTsx peerId={rootScope.myId} size={36} />
        <span class="vk-sidebar-me-name">{fullName() || 'Моя страница'}</span>
      </button>

      {renderItems(MAIN_SECTIONS)}
      <div class="vk-sidebar-divider" />
      {renderItems(BOTTOM_SECTIONS)}

      <Show when={user()?.username}>
        <div class="vk-sidebar-footer">@{user().username}</div>
      </Show>
    </nav>
  );
}

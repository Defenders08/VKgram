import {For, Show} from 'solid-js';
import type {User} from '@layer';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {getVKSections, VKSection, VKSectionId} from '@/vkgram/sections';
import {vkSidebarMenuSettings} from '@/vkgram/pages/settings/sidebarMenu';
import {confirmVKLogout} from '@/vkgram/logout';
import createMessagesUnread, {formatUnreadBadge} from '@/vkgram/hooks/createMessagesUnread';
import VKMiniPlayer from '@/vkgram/components/VKMiniPlayer';
import VKIcon from '@/vkgram/components/VKIcons';

const MAIN_SECTIONS = getVKSections([
  'profile', 'news', 'messages', 'friends', 'channels', 'audio', 'photos', 'videos', 'docs', 'apps'
]);
// in the drawer «Страница» is the header itself, not a row of the list; the rows are
// grouped (talk / media / the rest) with a thin line between the groups
const DRAWER_GROUPS = [
  getVKSections(['news', 'messages', 'friends', 'channels']),
  getVKSections(['audio', 'photos', 'videos', 'docs', 'apps'])
];
const BOTTOM_SECTIONS = getVKSections(['telegram', 'settings']);

export type VKSidebarProps = {
  active: VKSectionId,
  onSectionChange: (id: VKSectionId) => void,
  // «Выйти» as the last item of the list
  withLogout?: boolean,
  // drawer: the mobile side menu — a blue profile header over the list (the
  // «Страница» of the drawer, the mini player lives under it) and icons on the rows;
  // desktop keeps the plain text menu of the old VK
  variant?: 'desktop' | 'drawer'
};

/**
 * The left menu in the old VK shape: the sections in one list, settings below
 * a divider. Reports the chosen section up — the layout decides what to show.
 * As the mobile side menu (`variant="drawer"`) it gains the profile header and
 * row icons, and «Выйти» closes the list.
 */
export default function VKSidebar(props: VKSidebarProps) {
  const messagesUnread = createMessagesUnread();
  const isDrawer = () => props.variant === 'drawer';
  // the signed-in user for the drawer's header
  const user = useUser(() => rootScope.myId.toUserId()) as () => User.user | undefined;
  const myName = () => {
    const current = user();
    if(!current || current.pFlags?.deleted) return undefined;
    return [current.first_name, current.last_name].filter(Boolean).join(' ') || undefined;
  };
  const myUsername = () => {
    const current = user();
    return current && !current.pFlags?.deleted ? getPeerActiveUsernames(current)[0] : undefined;
  };
  // the number on «Сообщения»; the other items have none
  const getBadge = (id: VKSectionId) => id === 'messages' && messagesUnread().count > 0 ? messagesUnread() : undefined;

  // «Настройки» → «Левое меню»: the sections the user took out of the menu do not
  // stand in it — on the desktop and in the drawer alike; the drawer's empty groups
  // (and their divider) leave with their rows
  const shown = (items: VKSection[]) => {
    const hidden = vkSidebarMenuSettings().hidden;
    return items.filter((item) => !hidden.includes(item.id));
  };
  const drawerGroups = () => DRAWER_GROUPS.map((group) => shown(group)).filter((group) => group.length);

  const renderItems = (items: VKSection[]) => (
    <ul class="vk-sidebar-list">
      <For each={items}>
        {(item) => (
          <li>
            <button
              type="button"
              class="vk-sidebar-item"
              classList={{
                'is-active': props.active === item.id,
                'has-badge': !!getBadge(item.id),
                'with-icon': isDrawer()
              }}
              aria-current={props.active === item.id ? 'page' : undefined}
              onClick={() => props.onSectionChange(item.id)}
            >
              <Show when={isDrawer()}>
                <VKIcon name={item.icon} size={22} class="vk-sidebar-item-icon" />
              </Show>
              <span class="vk-sidebar-item-text">{item.title}</span>
              <Show when={getBadge(item.id)}>
                {(badge) => (
                  <span class="vk-sidebar-item-badge" classList={{'is-muted': badge().isMuted}}>
                    {formatUnreadBadge(badge().count)}
                  </span>
                )}
              </Show>
            </button>
          </li>
        )}
      </For>
    </ul>
  );

  return (
    <nav class="vk-sidebar" classList={{'is-drawer': isDrawer()}} aria-label="Главное меню">
      <Show when={isDrawer()}>
        <button
          type="button"
          class="vk-menu-header"
          classList={{'is-active': props.active === 'profile'}}
          aria-current={props.active === 'profile' ? 'page' : undefined}
          onClick={() => props.onSectionChange('profile')}
        >
          <AvatarNewTsx peerId={rootScope.myId} size={48} class="vk-menu-header-avatar" />
          <span class="vk-menu-header-main">
            <span class="vk-menu-header-name">{myName() || 'Моя страница'}</span>
            <Show when={myUsername()}>
              {(username) => <span class="vk-menu-header-username">@{username()}</span>}
            </Show>
          </span>
          <VKIcon name="chevron" size={16} class="vk-menu-header-chevron" />
        </button>
        <VKMiniPlayer variant="drawer" />
      </Show>

      <Show when={isDrawer()} fallback={renderItems(shown(MAIN_SECTIONS))}>
        <For each={drawerGroups()}>
          {(group) => (
            <>
              {renderItems(group)}
              <div class="vk-sidebar-divider" />
            </>
          )}
        </For>
      </Show>
      <Show when={!isDrawer()}>
        <div class="vk-sidebar-divider" />
      </Show>
      {renderItems(shown(BOTTOM_SECTIONS))}

      <Show when={props.withLogout}>
        {/* the drawer pins «Выйти» (with its divider) to the bottom edge of the panel */}
        <div class="vk-sidebar-footer">
          <div class="vk-sidebar-divider" />
          <ul class="vk-sidebar-list">
            <li>
              <button
                type="button"
                class="vk-sidebar-item vk-sidebar-item-logout"
                classList={{'with-icon': isDrawer()}}
                onClick={() => confirmVKLogout()}
              >
                <Show when={isDrawer()}>
                  <VKIcon name="logout" size={22} class="vk-sidebar-item-icon" />
                </Show>
                <span class="vk-sidebar-item-text">Выйти</span>
              </button>
            </li>
          </ul>
        </div>
      </Show>
    </nav>
  );
}

import {Show} from 'solid-js';
import type {User} from '@layer';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import {openVKSection} from '@/vkgram/sections';
import VKHeaderSearch from '@/vkgram/components/VKHeaderSearch';

export type VKHeaderProps = {
  variant: 'desktop' | 'mobile',
  // mobile only — the "☰" button; omitted → the button isn't rendered
  onMenuClick?: () => void,
  isMenuActive?: boolean,
  // id of the panel the menu button opens
  menuControls?: string
};

/**
 * The top blue bar in the old VK shape: logo on the left, the search in the
 * middle (desktop), the signed-in user on the right — their avatar opens
 * «Моя страница» (on mobile it is the only way there: the bottom bar has no
 * room for it).
 */
export default function VKHeader(props: VKHeaderProps) {
  const user = useUser(() => rootScope.myId.toUserId()) as () => User.user;
  const firstName = () => user()?.first_name;

  const renderUser = (variant: 'desktop' | 'mobile') => (
    <button
      type="button"
      class="vk-header-user"
      classList={{'is-mobile': variant === 'mobile'}}
      aria-label={firstName() ? `${firstName()} — Моя страница` : 'Моя страница'}
      title="Моя страница"
      onClick={() => openVKSection('profile')}
    >
      <AvatarNewTsx peerId={rootScope.myId} size={variant === 'desktop' ? 25 : 28} />
      <Show when={variant === 'desktop' && firstName()}>
        <span class="vk-header-user-name">{firstName()}</span>
      </Show>
    </button>
  );

  return (
    <header class="vk-header" classList={{'is-mobile': props.variant === 'mobile'}}>
      <div class="vk-header-inner">
        <button type="button" class="vk-header-logo" onClick={() => openVKSection('news')} title="Новости">
          ВКГРАМ
        </button>

        <Show when={props.variant === 'desktop'}>
          <VKHeaderSearch />
        </Show>

        <div class="vk-header-spacer" />

        {renderUser(props.variant)}

        <Show when={props.variant === 'mobile' && props.onMenuClick}>
          <button
            type="button"
            class="vk-header-menu-button"
            classList={{'is-active': !!props.isMenuActive}}
            aria-label="Меню"
            aria-expanded={!!props.isMenuActive}
            aria-controls={props.menuControls}
            onClick={() => props.onMenuClick()}
          >
            ☰
          </button>
        </Show>
      </div>
    </header>
  );
}

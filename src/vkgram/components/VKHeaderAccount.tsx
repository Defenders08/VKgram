import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import type {User} from '@layer';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {openVKSection} from '@/vkgram/sections';
import {addVKgramAccount} from '@/vkgram/accounts';
import {VKGRAM_BRAND} from '@/vkgram/documentTitle';
import VKPeerAvatar from '@/vkgram/components/VKPeerAvatar';
import VKIcon from '@/vkgram/components/VKIcons';

// as long as the leaving of the panel (see `vk-settings-out`)
const CLOSE_DELAY = 140;

const MENU_ID = 'vk-header-account-menu';

/**
 * The logo block of the header. On desktop the signed-in user's field (the small
 * profile icon and the username in lower case) opens the account menu: the current account with its avatar, wrapped in VK's
 * blue frame as in the old VK menu — the row opens «Страница» — and «Добавить
 * аккаунт», which runs Web K's own add-account flow (the limits, the premium
 * check and the limit popup are its). A desktop while there is no user keeps the
 * wordmark «VKGRAM» that opens «Новости»; a phone has no wordmark in its bar.
 * The menu closes on a click outside and on Escape, the focus goes back to the
 * field.
 */
export default function VKHeaderAccount(props: {variant: 'desktop' | 'mobile'}) {
  const user = useUser(() => rootScope.myId.toUserId()) as () => User.user | undefined;
  // `isOpen` is the choice, `isMounted` is the menu in the page: it stays a moment after the
  // closing to be seen leaving
  const [isOpen, setOpen] = createSignal(false);
  const [isMounted, setMounted] = createSignal(false);
  let root: HTMLDivElement;
  let button: HTMLButtonElement;

  // desktop: the signed-in user (a small profile icon and the username in lower case; without one —
  // the name as it is written) stands in the place of the logo;
  // an account without a username shows its name instead
  const userName = () => {
    const current = user();
    if(!current || current.pFlags?.deleted) return '';
    const username = getPeerActiveUsernames(current)[0];
    return username ? username.toLowerCase() : [current.first_name, current.last_name].filter(Boolean).join(' ');
  };

  // the field is the account button on desktop only
  const isAccountButton = () => props.variant === 'desktop' && !!userName();

  // the row shows the name as it is written — the field above shows the @username
  const accountName = () => {
    const current = user();
    if(!current || current.pFlags?.deleted) return '';
    return [current.first_name, current.last_name].filter(Boolean).join(' ') || userName();
  };

  // the gray note under the name in the menu; hidden when there is none
  const userUsername = () => {
    const current = user();
    if(!current || current.pFlags?.deleted) return '';
    return getPeerActiveUsernames(current)[0] || '';
  };

  createEffect(() => {
    if(isOpen()) {
      setMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), CLOSE_DELAY);
    onCleanup(() => window.clearTimeout(timeout));
  });

  createEffect(() => {
    if(!isOpen()) return;

    const onPointerDown = (e: PointerEvent) => {
      if(!root.contains(e.target as Node)) setOpen(false);
    };
    // the menu owns Escape while it is open: it closes, nothing under it reacts
    const onKeyDown = (e: KeyboardEvent) => {
      if(e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      button.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    onCleanup(() => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    });
  });

  const openProfile = () => {
    setOpen(false);
    openVKSection('profile');
  };

  // «Добавить аккаунт»: VKgram's own entry into Web K's flow (`addVKgramAccount` —
  // the limits, the premium check, the limit popup and the switch); a failure is
  // logged, not silent
  const addAccount = async(e: MouseEvent) => {
    setOpen(false);
    try {
      await addVKgramAccount(e);
    } catch(err) {
      console.error('VKHeaderAccount: the add-account flow failed', err);
    }
  };

  return (
    <Show
      when={props.variant === 'desktop'}
      // on a phone the bar has no wordmark: the burger and the page's own buttons only
      fallback={null}
    >
      <div ref={root} class="vk-header-account" classList={{'has-user': isAccountButton()}}>
        <button
          ref={button}
          type="button"
          class="vk-header-logo"
          classList={{'has-user': isAccountButton()}}
          title={isAccountButton() ? 'Аккаунт' : 'Новости'}
          aria-label={isAccountButton() ? 'Аккаунт' : 'Новости'}
          aria-expanded={isAccountButton() ? isOpen() : undefined}
          aria-controls={isAccountButton() ? MENU_ID : undefined}
          onClick={() => {
            if(!isAccountButton()) {
              openVKSection('news');
              return;
            }
            setOpen((open) => !open);
          }}
        >
          <Show when={isAccountButton()} fallback={VKGRAM_BRAND}>
            <VKIcon name="profile" size={15} class="vk-header-user-icon" />
            <span class="vk-header-user-text">
              <span class="vk-header-user-name">{userName()}</span>
            </span>
          </Show>
        </button>

        <Show when={isMounted()}>
          <div id={MENU_ID} class="vk-account-menu" classList={{'is-closing': !isOpen()}} role="group" aria-label="Аккаунт">
            <div class="vk-account-menu-head">
              <span class="vk-account-menu-title">Аккаунт</span>
            </div>

            <button type="button" class="vk-account-menu-item" onClick={openProfile}>
              <VKPeerAvatar peerId={rootScope.myId.toPeerId()} peer={user()} size={32} />
              <span class="vk-account-menu-name">
                <span class="vk-account-menu-name-title">{accountName()}</span>
                <Show when={userUsername()}>
                  <span class="vk-account-menu-name-note">@{userUsername()}</span>
                </Show>
              </span>
            </button>

            <button type="button" class="vk-account-menu-item" onClick={addAccount}>
              <span class="vk-account-menu-item-icon" aria-hidden="true">
                <VKIcon name="plus" size={16} />
              </span>
              <span class="vk-account-menu-name">
                <span class="vk-account-menu-name-title">Добавить аккаунт</span>
              </span>
            </button>
          </div>
        </Show>
      </div>
    </Show>
  );
}

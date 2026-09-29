import {createEffect, createSignal, on, onCleanup, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {useMediaSizes} from '@helpers/mediaSizes';
import {useHasOpenLeftTabs} from '@stores/foldersSidebar';
import updateColumnWidths, {setColumnsLayoutContainer} from '@helpers/updateColumnWidths';
import appChatBackground from '@components/chat/bubbles/chatBackground';
import type Chat from '@components/chat/chat';
import {
  getSectionFromUrl,
  pushSectionHistory,
  setSectionToUrl,
  setVKSectionNavigator,
  VK_DEFAULT_SECTION,
  VKSectionId
} from '@/vkgram/sections';
import {closeVKChannel} from '@/vkgram/pages/channel/route';
import VKDesktopLayout from '@/vkgram/layouts/VKDesktopLayout';
import VKMobileLayout from '@/vkgram/layouts/VKMobileLayout';

import '@/vkgram/styles/vk-base.scss';

export type VKResponsiveLayoutProps = {
  // holder of the existing Web K messenger (`#page-chats`)
  messagesHost?: HTMLElement
};

/**
 * Entry point of the VKgram UI: picks the desktop or the mobile structure
 * using Web K's own breakpoint store (`useMediaSizes().isMobile`, ≤600px).
 *
 * The current section lives here, in one signal: the sidebar / mobile nav
 * only report a choice, both layouts render from the same value, so the
 * section survives a desktop ↔ mobile switch.
 */
export default function VKResponsiveLayout(props: VKResponsiveLayoutProps) {
  const sizes = useMediaSizes();
  const [section, setSection] = createSignal<VKSectionId>(getSectionFromUrl() ?? VK_DEFAULT_SECTION);

  const showSection = (id: VKSectionId, fromHistory?: boolean) => {
    const previous = section();
    if(previous === id) {
      // a click on the active «Каналы» while a channel is open goes back to the list
      if(id === 'channels') closeVKChannel();
      return;
    }

    setSection(id);
    // Back returns to `previous`; a Back itself must not push again
    if(!fromHistory) pushSectionHistory(() => showSection(previous, true));
    setSectionToUrl(id);
  };

  if(getSectionFromUrl() !== section()) {
    setSectionToUrl(section());
  }

  // A chat opened from anywhere (a link, a notification, search) has to be
  // visible, so it brings «Сообщения» up. Lazy: appImManager is already loaded
  // by now, a static import would drag it into this chunk's import graph.
  let unsubscribe: () => void;
  let disposed = false;
  import('@lib/appImManager').then(({default: appImManager}) => {
    if(disposed) return;
    const onPeerChanged = (chat: Chat) => {
      if(chat.peerId) showSection('messages');
    };
    appImManager.addEventListener('peer_changed', onPeerChanged);
    unsubscribe = () => appImManager.removeEventListener('peer_changed', onPeerChanged);
  });
  onCleanup(() => {
    disposed = true;
    unsubscribe?.();
  });

  // The same for a Web K tab opening in the left column (settings, privacy,
  // a new channel…) from a flow VKgram didn't start — e.g. the privacy link of
  // Web K's birthday popup. Only a false → true change counts.
  const [hasOpenLeftTabs] = useHasOpenLeftTabs();
  createEffect(on(hasOpenLeftTabs, (hasOpen) => {
    if(hasOpen) showSection('messages');
  }, {defer: true}));

  setVKSectionNavigator(showSection);
  onCleanup(() => setVKSectionNavigator(undefined));

  return (
    <div class="vkgram">
      <Show
        when={sizes.isMobile}
        fallback={
          <VKDesktopLayout section={section()} onSectionChange={showSection} messagesHost={props.messagesHost} />
        }
      >
        <VKMobileLayout section={section()} onSectionChange={showSection} messagesHost={props.messagesHost} />
      </Show>
    </div>
  );
}

/**
 * Kill switch: `?vkgram=0` in the URL, or `localStorage['vkgram-disabled'] = '1'`,
 * boots the plain Web K UI.
 */
export function isVKgramEnabled() {
  try {
    if(new URLSearchParams(location.search).get('vkgram') === '0') return false;
    if(localStorage.getItem('vkgram-disabled') === '1') return false;
  } catch(err) {}

  return true;
}

let activeDispose: (() => void) | null = null;

/**
 * Wraps the existing Web K shell (`#page-chats`) into the VKgram layout: the
 * shell node is moved into the layout's content area as-is, nothing inside it
 * is re-created. Returns a callback that puts the shell back where it was.
 *
 * Call it after `appDialogsManager.start()`: that is where `appImManager`
 * attaches the chat wallpaper layer to `<body>`, and it has to be taken over
 * after that.
 */
export function mountVKResponsiveLayout(appRoot: HTMLElement): () => void {
  activeDispose?.();

  const root = document.createElement('div');
  root.id = 'vkgram-root';
  root.style.display = 'contents';
  appRoot.before(root);

  // One stable node holds the wallpaper + the shell, so switching between the
  // desktop and mobile layouts moves them together.
  const host = document.createElement('div');
  host.classList.add('vk-content-host');
  host.append(appRoot);
  // The wallpaper is a full-window layer in <body> that would paint over the
  // VKgram sidebar; inside the host it covers exactly the Web K area.
  appChatBackground.attach(host);

  const dispose = render(() => <VKResponsiveLayout messagesHost={host} />, root);
  document.documentElement.classList.add('is-vkgram');

  // Web K sizes its columns by the window by default — make it use the space
  // left beside the VKgram sidebar.
  setColumnsLayoutContainer(host);
  const resizeObserver = new ResizeObserver(() => updateColumnWidths());
  resizeObserver.observe(host);

  activeDispose = () => {
    resizeObserver.disconnect();
    setColumnsLayoutContainer(null);
    appChatBackground.attach(document.body);
    root.before(appRoot); // take the shell out before Solid removes the layout
    dispose();
    root.remove();
    document.documentElement.classList.remove('is-vkgram');
    activeDispose = null;
  };

  return activeDispose;
}

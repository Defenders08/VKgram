import {createEffect, createSignal, on, onCleanup, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {useMediaSizes} from '@helpers/mediaSizes';
import {useHasOpenLeftTabs} from '@stores/foldersSidebar';
import updateColumnWidths, {setColumnsLayoutContainer} from '@helpers/updateColumnWidths';
import appChatBackground from '@components/chat/bubbles/chatBackground';
import type Chat from '@components/chat/chat';
import rootScope from '@lib/rootScope';
import {
  getInitialSection,
  getSectionFromUrl,
  getVKSection,
  pushSectionHistory,
  setSectionToUrl,
  setVKSectionNavigator,
  VKSectionId
} from '@/vkgram/sections';
import {setVKgramDocumentTitle, startVKgramDocumentTitle} from '@/vkgram/documentTitle';
import {closeVKChannel} from '@/vkgram/pages/channel/route';
import {pinLightTheme, unpinLightTheme} from '@/vkgram/lightTheme';
import {resetVKProfile} from '@/vkgram/pages/profile/route';
import VKDesktopLayout from '@/vkgram/layouts/VKDesktopLayout';
import VKMobileLayout from '@/vkgram/layouts/VKMobileLayout';
import {isVKgramEnabled, removeVKgramSplash} from '@/vkgram/boot';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {isBroadcastChannel} from '@/vkgram/hooks/useSubscribedChannels';

// re-exported for the boot path (src/pages/bootstrapIm.ts) — the contract lives
// in the dependency-free boot module now
export {isVKgramEnabled};

import '@/vkgram/styles/vk-base.scss';
import '@/vkgram/styles/vk-viewers.scss';

export type VKResponsiveLayoutProps = {
  // holder of the existing Web K / Telegram interface (`#page-chats`)
  telegramHost?: HTMLElement
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
  const [section, setSection] = createSignal<VKSectionId>(getInitialSection());

  // the tab says the open section: «VKGRAM - Новости», «VKGRAM - Сообщения»…
  startVKgramDocumentTitle(getVKSection(section())?.title);
  createEffect(() => setVKgramDocumentTitle(getVKSection(section())?.title));

  const showSection = (id: VKSectionId, fromHistory?: boolean) => {
    const previous = section();
    if(previous === id) {
      // a click on the active «Каналы» while a channel is open goes back to the list
      if(id === 'channels') closeVKChannel();
      // …and on «Моя страница» while another user's page is open goes back to mine
      else if(id === 'profile') resetVKProfile();
      return;
    }

    // «Моя страница» from another section is mine, not the last page seen
    // (Back is different: it returns to what was on screen)
    if(id === 'profile' && !fromHistory) resetVKProfile();

    setSection(id);
    // Back returns to `previous`; a Back itself must not push again
    if(!fromHistory) pushSectionHistory(() => showSection(previous, true));
    setSectionToUrl(id);
  };

  if(getSectionFromUrl() !== section()) {
    setSectionToUrl(section());
  }

  // A chat that Web K opens by itself (its own link / @mention handlers, a notification, a bot link, the
  // chat it restores at the start) must not throw the user into the Telegram interface from a VKgram
  // page: it opens in VKgram — a channel on its page in «Каналы», anything else in «Сообщения». Only the
  // flows that DO mean the messenger («Телеграм», «Открыть в Телеграм», the ones through
  // `openInTelegram`) have «Телеграм» up already, and the chat stays where it opened. This holds from the
  // very first second: there used to be a grace period at the start in which a restored chat switched
  // the app to «Телеграм» — the original Web K was what the user saw after every reload.
  // Lazy: appImManager is already loaded by now, a static import would drag it into this chunk's import graph.
  let unsubscribe: () => void;
  let disposed = false;
  const openInVKgram = async(peerId: PeerId) => {
    const peer = await rootScope.managers.appPeersManager.getPeer(peerId);
    if(isBroadcastChannel(peer)) openVKChannelPage(peerId);
    else openVKChat(peerId);
  };
  import('@lib/appImManager').then(({default: appImManager}) => {
    if(disposed) return;
    const onPeerChanged = (chat: Chat) => {
      if(!chat.peerId || section() === 'telegram') return;
      void openInVKgram(chat.peerId).catch((err) => {
        console.error('VKgram: failed to open a chat in VKgram, showing it in «Телеграм»', err);
        showSection('telegram');
      });
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
    if(hasOpen) showSection('telegram');
  }, {defer: true}));

  setVKSectionNavigator(showSection);
  onCleanup(() => setVKSectionNavigator(undefined));

  return (
    <div class="vkgram">
      <Show
        when={sizes.isMobile}
        fallback={
          <VKDesktopLayout section={section()} onSectionChange={showSection} telegramHost={props.telegramHost} />
        }
      >
        <VKMobileLayout section={section()} onSectionChange={showSection} telegramHost={props.telegramHost} />
      </Show>
    </div>
  );
}

/**
 * Kill switch: `?vkgram=0` in the URL, or `localStorage['vkgram-disabled'] = '1'`,
 * boots the plain Web K UI. The contract lives in `@/vkgram/boot` and is
 * re-exported at the top of this file.
 */

let activeDispose: (() => void) | null = null;

/**
 * Wraps the existing Web K shell (`#page-chats`) into the VKgram layout: the
 * Telegram/Web K shell node is moved into the layout's content area as-is, nothing inside it
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

  const dispose = render(() => <VKResponsiveLayout telegramHost={host} />, root);
  document.documentElement.classList.add('is-vkgram');
  // VKgram is a light design: while it is mounted, the night theme stays off
  pinLightTheme();

  // The layout is in the DOM and owns the screen now: let its first painted
  // frame in (the theme repaint above included), then let the boot splash go —
  // it fades out and removes itself (see removeVKgramSplash).
  requestAnimationFrame(() => requestAnimationFrame(removeVKgramSplash));

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
    unpinLightTheme();
    document.documentElement.classList.remove('is-vkgram');
    activeDispose = null;
  };

  return activeDispose;
}

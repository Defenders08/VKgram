import rootScope from '@lib/rootScope';
import {openInMessages} from '@/vkgram/sections';

/**
 * Doors from VKgram into Web K flows that only exist as Web K UI (sidebar
 * tabs, the chat itself). Each brings «Сообщения» up first — the flow opens
 * in the messenger's own columns. Everything is imported lazily: these
 * modules are already loaded by the running messenger.
 */

type WebKTabs = typeof import('@components/solidJsTabs/tabs');
type LeftTabName =
  | 'AppNewChannelTab'
  | 'AppNotificationsTab'
  | 'AppChatBackgroundTab'
  | 'AppGeneralSettingsTab'
  | 'AppDataAndStorageTab'
  | 'AppPrivacyGiftsTab';

export function openWebKLeftTab(name: LeftTabName, getPayload?: () => MaybePromise<any>) {
  return openInMessages(async() => {
    const [{default: appSidebarLeft}, tabs] = await Promise.all([
      import('@components/sidebarLeft'),
      // the index registers every tab with SuperTabProvider
      import('@components/solidJsTabs').then(() => import('@components/solidJsTabs/tabs'))
    ]);
    const tab = (tabs as WebKTabs)[name];
    const payload = getPayload ? await getPayload() : undefined;
    appSidebarLeft.createTab(tab as any).open(payload);
  });
}

export function openWebKChat(peerId: PeerId) {
  return openInMessages(async() => {
    const {default: appImManager} = await import('@lib/appImManager');
    appImManager.setInnerPeer({peerId});
  });
}

/**
 * Another user's profile — Web K has no standalone profile page, it is the
 * shared-media tab of the right column of the chat with that peer. So the chat
 * is opened first, then the right column is brought up (the same thing the
 * chat's top bar does when its title is clicked).
 */
export function openWebKProfile(peerId: PeerId) {
  return openInMessages(async() => {
    const [{default: appImManager}, {default: appSidebarRight}] = await Promise.all([
      import('@lib/appImManager'),
      import('@components/sidebarRight')
    ]);
    await appImManager.setInnerPeer({peerId});
    await appSidebarRight.toggleSidebar(true);
  });
}

// the profile playlist (Web K's right-column tab)
export function openWebKSavedMusic(peerId: PeerId = rootScope.myId) {
  return openInMessages(async() => {
    const [{default: appSidebarRight}, {openSavedMusicTab}] = await Promise.all([
      import('@components/sidebarRight'),
      import('@components/savedMusicActions')
    ]);
    openSavedMusicTab(appSidebarRight, peerId);
  });
}

/** A message inside its chat: the chat is opened and scrolled to the message */
export function openWebKMessage(peerId: PeerId, mid: number) {
  return openInMessages(async() => {
    const {default: appImManager} = await import('@lib/appImManager');
    appImManager.setInnerPeer({peerId, lastMsgId: mid});
  });
}

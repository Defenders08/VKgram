import rootScope from '@lib/rootScope';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import {openInTelegram} from '@/vkgram/sections';
import {registerVKgramTelegramLinkHandlers} from '@/vkgram/utils/telegramLinkHandlers';

registerVKgramTelegramLinkHandlers();

/**
 * Doors from VKgram into Web K flows that only exist as Web K UI (sidebar
 * tabs, the chat itself). Each brings «Телеграм» up first — the flow opens
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
  return openInTelegram(async() => {
    const [{default: appSidebarLeft}, tabs] = await Promise.all([
      import('@components/sidebarLeft'),
      // the index registers every tab with SuperTabProvider
      import('@components/solidJsTabs').then(() => import('@components/solidJsTabs/tabs'))
    ]);
    const tab = (tabs as WebKTabs)[name];
    // a tab Web K does not export under this name must fail loudly, not as `createTab(undefined)`
    if(!tab) throw new Error(`VKgram: Web K has no left tab "${name}"`);
    const payload = getPayload ? await getPayload() : undefined;
    // a scaffolded component reads its props off `tab.payload` — an undefined
    // payload breaks the destructure and the tab renders empty
    appSidebarLeft.createTab(tab as any).open(payload ?? {});
  });
}

/**
 * A Web K settings tab shown the way Web K itself shows it when the left column
 * is collapsed: in `showSettingsSliderPopup`, a modal with the original tab
 * inside. It lies over whatever VKgram page is open, so — unlike
 * `openWebKLeftTab` — «Телеграм» is not brought up and nothing is copied: the
 * tab is Web K's own class, opened with the same payload the sidebar would give.
 */
export async function openWebKPopupTab(name: LeftTabName, getPayload?: () => MaybePromise<any>) {
  const [{default: showSettingsSliderPopup}, tabs] = await Promise.all([
    import('@components/sidebarLeft/settingsSliderPopup'),
    // the index registers every tab with SuperTabProvider
    import('@components/solidJsTabs').then(() => import('@components/solidJsTabs/tabs'))
  ]);
  const tab = (tabs as WebKTabs)[name];
  // a tab Web K does not export under this name must fail loudly, not as `createTab(undefined)`
  if(!tab) throw new Error(`VKgram: Web K has no tab "${name}"`);
  const payload = getPayload ? await getPayload() : undefined;
  showSettingsSliderPopup(rootScope.managers)
  .createTab(tab as any)
  .open(payload);
}

/**
 * Web K's own creation of a chat folder («Новая папка»), as the popup Web K
 * itself uses for it (`sidebarLeft.createTab` opens `AppEditFolderTab` in
 * `showSettingsSliderPopup` when the left column is collapsed). A popup lies
 * over whatever page is open, so — unlike `openWebKLeftTab` — it does not
 * bring «Сообщения» up.
 *
 * The folder is saved by Web K (`filtersStorage.createDialogFilter`, which
 * reports `filter_update`); nothing is stored here. The folder limit is checked
 * first, the way Web K's «Папки» screen does.
 */
export async function openWebKFolderCreation() {
  const [{default: showSettingsSliderPopup}, {default: showLimitPopup}, tabs] = await Promise.all([
    import('@components/sidebarLeft/settingsSliderPopup'),
    import('@components/popups/limit'),
    // the index registers every tab with SuperTabProvider
    import('@components/solidJsTabs').then(() => import('@components/solidJsTabs/tabs'))
  ]);
  const {AppEditFolderTab} = tabs as WebKTabs;

  const [limit, filters] = await Promise.all([
    rootScope.managers.apiManager.getLimit('folders'),
    rootScope.managers.filtersStorage.getDialogFilters()
  ]);
  // «Все» and the archive are Web K's built-ins, not folders of the user
  const foldersCount = filters.filter((filter) => filter.id !== FOLDER_ID_ALL && filter.id !== FOLDER_ID_ARCHIVE).length;
  if(foldersCount >= limit) {
    showLimitPopup('folders');
    return;
  }

  showSettingsSliderPopup(rootScope.managers)
  .createTab(AppEditFolderTab as any)
  .open(AppEditFolderTab.getInitArgs());
}

export function openWebKChat(peerId: PeerId) {
  return openInTelegram(async() => {
    const {default: appImManager} = await import('@lib/appImManager');
    appImManager.setInnerPeer({peerId});
  });
}

/**
 * «Изменить» and «Статистика» of a channel: Web K's own right-column tabs
 * (`sidebarRight/tabs/editChat`, `sidebarRight/tabs/statistics`) shown in a
 * modal over the current VKgram page, in `showSettingsSliderPopup` — the popup
 * Web K itself puts its tabs in. Nothing is copied: the tab is Web K's class,
 * the page behind it stays as it is, and closing the popup returns to it.
 */
type ChannelTabName = 'edit' | 'statistics';
// Web K's older tabs read what they show from fields set before `open()` (`chatId`, `peerId`);
// the newer ones take it as `open`'s argument — both are given, each kind uses its own
type PopupTab = {open: (payload?: unknown) => MaybePromise<unknown>};

export async function openWebKChannelTab(name: ChannelTabName, peerId: PeerId) {
  try {
    // the index registers every tab with SuperTabProvider, tabs written in Solid need it
    await import('@components/solidJsTabs');
    const [{default: showSettingsSliderPopup}, tabs, statisticsModule] = await Promise.all([
      import('@components/sidebarLeft/settingsSliderPopup'),
      // «Изменить» is a Solid tab: its CLASS lives in tabs.ts (importing the
      // component module would create the tab from a function component and
      // open an empty window)
      import('@components/solidJsTabs/tabs'),
      name === 'statistics' ? import('@components/sidebarRight/tabs/statistics') : Promise.resolve(undefined)
    ]);

    const slider = showSettingsSliderPopup(rootScope.managers);

    if(name === 'edit') {
      const tab = slider.createTab(tabs.AppEditChatTab as Parameters<typeof slider.createTab>[0]);
      await tab.open({chatId: peerId.toChatId()});
      return;
    }

    const StatisticsTab = statisticsModule!.default;
    const tab = slider.createTab(StatisticsTab as Parameters<typeof slider.createTab>[0]) as unknown as PopupTab;
    // `init()` expects a ChatId and derives the peer itself — a PeerId here
    // misdetects the chat kind and the stats load never finishes
    await tab.open(peerId.toChatId());
  } catch(err) {
    console.error(`VKgram: failed to open the "${name}" tab of a channel`, err);
    throw err;
  }
}

// the tab of Web K's shared media (`SearchSuperMediaType`) that lists a server-side filter
const SHARED_MEDIA_TABS: {[filter in string]: {type: string}} = {
  inputMessagesFilterPhotoVideo: {type: 'media'},
  inputMessagesFilterDocument: {type: 'files'},
  inputMessagesFilterUrl: {type: 'links'},
  inputMessagesFilterMusic: {type: 'music'}
};

/**
 * «Показать все» of a channel's materials: Web K's own shared-media tab
 * (`AppSharedMediaTab` from `sidebarRight/tabs/sharedMediaTab` — the class the
 * right column uses) shown in a modal over the current VKgram page, in
 * `showSettingsSliderPopup`, the popup Web K itself puts its tabs in.
 *
 * Unlike the flows above, nothing here goes through `openInTelegram`: the chat
 * is not opened, the right column is not toggled, VKgram's page, channel and
 * scroll position stay as they are behind the overlay, and closing the popup
 * returns to exactly that state. Nothing is listed or drawn here — the modal
 * body is the original tab's list.
 *
 * The modal shows only the one list the block was drawn from («Файлы»,
 * «Ссылки»…): the tab is opened with `noProfile` (no channel header), and the
 * tab's header and the strip of the other shared-media tabs are hidden
 * (`.vk-shared-only`, vk-base.scss). The popup closes with Esc or a click on
 * the dimmed overlay, as any Web K popup.
 */
export async function openWebKSharedMedia(peerId: PeerId, inputFilter: MyInputMessagesFilter) {
  try {
    const [{default: showSettingsSliderPopup}, {default: AppSharedMediaTab}] = await Promise.all([
      import('@components/sidebarLeft/settingsSliderPopup'),
      // the file, not `./sharedMedia` — that one is the tab's Solid component
      import('@components/sidebarRight/tabs/sharedMediaTab')
    ]);

    const slider = showSettingsSliderPopup(rootScope.managers);
    // `open` is declared as returning nothing, yet the tab it opens is what we adjust below:
    // read it defensively instead of assuming a shape the type does not promise
    const tab = await AppSharedMediaTab.open(slider, peerId, true) as unknown as {
      container?: HTMLElement,
      searchSuper?: any
    } | undefined;
    if(!tab?.container) {
      console.warn('VKgram: shared media tab did not return its container');
      return;
    }

    const target = SHARED_MEDIA_TABS[inputFilter];
    if(!target) return;

    // only the list itself: no header, no strip of tabs (`.vk-shared-only`, vk-base.scss)
    tab.container.classList.add('vk-shared-only');

    // a tab with nothing in it stays hidden until Web K's counters come; select ours once it shows
    const searchSuper = tab.searchSuper;
    for(let attempt = 0; attempt < 50; ++attempt) {
      const mediaTab = searchSuper?.mediaTabsMap?.get(target.type);
      if(mediaTab && !mediaTab.menuTab.classList.contains('hide')) {
        searchSuper.selectTab(searchSuper.mediaTabs.indexOf(mediaTab), false);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    console.warn(`VKgram: shared media tab "${target.type}" did not show up`);
  } catch(err) {
    console.error('VKgram: failed to open shared media popup', err);
    throw err;
  }
}

// the profile playlist (Web K's right-column tab)
export function openWebKSavedMusic(peerId: PeerId = rootScope.myId) {
  return openInTelegram(async() => {
    const [{default: appSidebarRight}, {openSavedMusicTab}] = await Promise.all([
      import('@components/sidebarRight'),
      import('@components/savedMusicActions')
    ]);
    openSavedMusicTab(appSidebarRight, peerId);
  });
}

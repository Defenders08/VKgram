import appNavigationController from '@components/appNavigationController';
import type {VKIconName} from '@/vkgram/components/VKIcons';
import {getVKChannelUrlValue} from '@/vkgram/pages/channel/route';

/**
 * Sections of VKgram — the single list shared by the sidebar, the mobile nav,
 * the pages and the URL.
 */
export type VKSectionId =
  | 'profile'
  | 'news'
  | 'messages'
  | 'friends'
  | 'groups'
  | 'channels'
  | 'settings';

export type VKSection = {
  id: VKSectionId,
  title: string,
  icon: VKIconName
};

export const VK_SECTIONS: VKSection[] = [
  {id: 'profile', title: 'Моя страница', icon: 'profile'},
  {id: 'news', title: 'Новости', icon: 'news'},
  {id: 'messages', title: 'Сообщения', icon: 'messages'},
  {id: 'friends', title: 'Друзья', icon: 'friends'},
  {id: 'groups', title: 'Группы', icon: 'groups'},
  {id: 'channels', title: 'Каналы', icon: 'channels'},
  {id: 'settings', title: 'Настройки', icon: 'settings'}
];

export const VK_DEFAULT_SECTION: VKSectionId = 'messages';

export function getVKSection(id: VKSectionId) {
  return VK_SECTIONS.find((section) => section.id === id);
}

export function getVKSections(ids: VKSectionId[]) {
  return ids.map(getVKSection);
}

// * URL: `?vkgram=<section>` (`?vkgram=0` is the kill switch, see isVKgramEnabled)
const URL_PARAM = 'vkgram';

export function getSectionFromUrl(): VKSectionId | undefined {
  const value = new URLSearchParams(location.search).get(URL_PARAM);
  return VK_SECTIONS.find((section) => section.id === value)?.id;
}

/**
 * Reflect the section in the URL without a reload. Goes through Web K's
 * navigation controller queue so it never races its own history entries:
 * a section push lands first, then its URL is written onto that new entry.
 */
export function setSectionToUrl(id: VKSectionId) {
  appNavigationController.updateUrl((url) => {
    url.searchParams.set(URL_PARAM, id);
    // an open channel belongs to «Каналы» only
    const channel = id === 'channels' ? getVKChannelUrlValue() : undefined;
    if(channel) url.searchParams.set('channel', channel);
    else url.searchParams.delete('channel');
  });
}

// * Switching sections from inside a page (the layout registers the switcher)
let sectionNavigator: (id: VKSectionId) => void;

export function setVKSectionNavigator(navigator: typeof sectionNavigator) {
  sectionNavigator = navigator;
}

export function openVKSection(id: VKSectionId) {
  sectionNavigator?.(id);
}

/**
 * Run a Web K flow that lives in its own columns (a sidebar tab, a chat): it
 * would open inside the hidden messenger, so «Сообщения» is brought up first.
 */
export async function openInMessages(run: () => MaybePromise<void>) {
  openVKSection('messages');
  await run();
}

/**
 * Put a section change on Web K's navigation stack: browser Back pops it and
 * `onPop` returns to the previous section. Escape must not switch sections.
 */
export function pushSectionHistory(onPop: () => void) {
  appNavigationController.pushItem({
    type: 'vkgram-section',
    onPop: () => {
      onPop();
    },
    onEscape: () => false
  });
}

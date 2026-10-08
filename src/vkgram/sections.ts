import appNavigationController from '@components/appNavigationController';
import type {VKIconName} from '@/vkgram/components/VKIcons';
import {getVKChannelUrlValue} from '@/vkgram/pages/channel/route';
import {getVKProfileUrlValue} from '@/vkgram/pages/profile/route';
import {getVKMessagePeerUrlValue} from '@/vkgram/pages/messages/route';

/**
 * Sections of VKgram — the single list shared by the sidebar, the mobile nav,
 * the pages and the URL.
 */
export type VKSectionId =
  | 'profile'
  | 'news'
  | 'messages'
  | 'telegram'
  | 'friends'
  | 'groups'
  | 'channels'
  | 'audio'
  | 'photos'
  | 'videos'
  | 'docs'
  | 'apps'
  | 'settings';

export type VKSection = {
  id: VKSectionId,
  title: string,
  icon: VKIconName
};

// the order of the menu (sidebar and mobile drawer)
export const VK_SECTIONS: VKSection[] = [
  {id: 'profile', title: 'Страница', icon: 'profile'},
  {id: 'news', title: 'Новости', icon: 'news'},
  {id: 'messages', title: 'Сообщения', icon: 'messages'},
  {id: 'telegram', title: 'Телеграм', icon: 'telegram'},
  {id: 'friends', title: 'Друзья', icon: 'friends'},
  {id: 'groups', title: 'Группы', icon: 'groups'},
  {id: 'channels', title: 'Каналы', icon: 'channels'},
  {id: 'audio', title: 'Аудиозаписи', icon: 'audio'},
  {id: 'photos', title: 'Фотографии', icon: 'photos'},
  {id: 'videos', title: 'Видеозаписи', icon: 'videos'},
  {id: 'docs', title: 'Документы', icon: 'docs'},
  {id: 'apps', title: 'Приложения', icon: 'apps'},
  {id: 'settings', title: 'Настройки', icon: 'settings'}
];

// Where VKgram opens when the URL names no section. It must be one of VKgram's OWN pages: «Телеграм» is
// the original Web K shell, and as the default it was the first thing shown on every start.
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
 * The section the app opens on at the start. `?vkgram=telegram` is what a reload leaves behind after the
 * user has been in «Телеграм» (the section is mirrored to the URL), and honouring it brought the original
 * Web K shell back as the first screen. «Телеграм» is only ever entered on purpose, from the menu or from a
 * flow that needs the messenger's own columns — never restored at the start.
 */
export function getInitialSection(): VKSectionId {
  const fromUrl = getSectionFromUrl();
  return fromUrl && fromUrl !== 'telegram' ? fromUrl : VK_DEFAULT_SECTION;
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
    // …and an open profile of another user to «Моя страница»
    const user = id === 'profile' ? getVKProfileUrlValue() : undefined;
    if(user) url.searchParams.set('user', user);
    else url.searchParams.delete('user');
    // …and an open dialog to «Сообщения»
    const peer = id === 'messages' ? getVKMessagePeerUrlValue() : undefined;
    if(peer) url.searchParams.set('peer', peer);
    else url.searchParams.delete('peer');
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
 * would open inside the hidden Web K shell, so «Телеграм» is brought up first.
 */
export async function openInTelegram(run: () => MaybePromise<void>) {
  openVKSection('telegram');
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

import {afterEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import VKMobileNav from '@/vkgram/components/VKMobileNav';
import {importVKConfig} from '@/vkgram/config';
import {
  VK_MOBILE_NAV_DEFAULT,
  VK_MOBILE_NAV_MAX,
  VK_MOBILE_NAV_MIN,
  addVKMobileNavSection,
  moveVKMobileNavSection,
  removeVKMobileNavSection,
  resetVKMobileNavSettings,
  vkMobileNavSettings
} from '@/vkgram/pages/settings/mobileNav';

const mocks = vi.hoisted(() => ({unread: {count: 0, isMuted: false}}));

vi.mock('@/vkgram/hooks/createMessagesUnread', () => ({
  default: () => () => mocks.unread,
  formatUnreadBadge: (count: number) => count > 99 ? '99+' : String(count)
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  resetVKMobileNavSettings();
  localStorage.clear();
  mocks.unread = {count: 0, isMuted: false};
});

const mountNav = (jsx: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

const tabTitles = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.vk-mobile-nav-item-text')].map((el) => el.textContent);

const savedSections = () => {
  const saved = JSON.parse(localStorage.getItem('vkgram-config')!);
  return saved.sections.mobileNav.sections;
};

describe('mobileNav config section', () => {
  it('defaults to the three tabs the bar always showed', () => {
    expect(vkMobileNavSettings().sections).toEqual(['news', 'messages', 'audio']);
    expect(localStorage.getItem('vkgram-config')).toBeNull();
  });

  it('adds to the end, without duplicates and past the maximum', () => {
    addVKMobileNavSection('friends');
    expect(vkMobileNavSettings().sections).toEqual(['news', 'messages', 'audio', 'friends']);
    // a duplicate does not join
    addVKMobileNavSection('friends');
    expect(vkMobileNavSettings().sections).toHaveLength(4);

    addVKMobileNavSection('groups');
    expect(vkMobileNavSettings().sections).toHaveLength(VK_MOBILE_NAV_MAX);
    // the bar is full: one more does not fit
    addVKMobileNavSection('settings');
    expect(vkMobileNavSettings().sections).toEqual(['news', 'messages', 'audio', 'friends', 'groups']);
  });

  it('removes, but not below the minimum', () => {
    addVKMobileNavSection('friends');
    removeVKMobileNavSection('news');
    expect(vkMobileNavSettings().sections).toEqual(['messages', 'audio', 'friends']);

    removeVKMobileNavSection('audio');
    expect(vkMobileNavSettings().sections).toHaveLength(VK_MOBILE_NAV_MIN);
    // three tabs is the least the bar keeps
    removeVKMobileNavSection('friends');
    expect(vkMobileNavSettings().sections).toEqual(['messages', 'audio', 'friends']);
  });

  it('moves a section one place up and down', () => {
    moveVKMobileNavSection('audio', -1);
    expect(vkMobileNavSettings().sections).toEqual(['news', 'audio', 'messages']);
    moveVKMobileNavSection('audio', 1);
    expect(vkMobileNavSettings().sections).toEqual(['news', 'messages', 'audio']);
    // the first one cannot go up
    moveVKMobileNavSection('news', -1);
    expect(vkMobileNavSettings().sections).toEqual(['news', 'messages', 'audio']);
  });

  it('saves every change to the config storage and drops it on reset', () => {
    addVKMobileNavSection('settings');
    expect(savedSections()).toEqual(['news', 'messages', 'audio', 'settings']);

    resetVKMobileNavSettings();
    expect(vkMobileNavSettings().sections).toEqual(VK_MOBILE_NAV_DEFAULT);
    // the section is dropped, not saved as the default (here it is the only one, so the key goes too)
    const saved = localStorage.getItem('vkgram-config');
    expect(saved ? JSON.parse(saved).sections.mobileNav : undefined).toBeUndefined();
  });

  it('reads a config file: unknown ids and duplicates are dropped, too few means the default', () => {
    const result = importVKConfig(JSON.stringify({
      app: 'vkgram',
      type: 'config',
      version: 1,
      exportedAt: '2026-10-08T00:00:00.000Z',
      settings: {mobileNav: {sections: ['settings', 'bogus', 'settings', 'friends']}}
    }));
    expect(result).toMatchObject({ok: true, applied: ['Мобильный навбар']});
    expect(vkMobileNavSettings().sections).toEqual(VK_MOBILE_NAV_DEFAULT);

    // a broken section fails the whole import, nothing is half-applied
    const broken = importVKConfig(JSON.stringify({
      app: 'vkgram',
      type: 'config',
      version: 1,
      exportedAt: '2026-10-08T00:00:00.000Z',
      settings: {mobileNav: 'garbage'}
    }));
    expect(broken).toMatchObject({ok: false});
  });
});

describe('VKMobileNav from the config', () => {
  it('renders the default three tabs', () => {
    const root = mountNav(() => <VKMobileNav active="news" onSectionChange={vi.fn()} />);
    expect(tabTitles(root)).toEqual(['Новости', 'Сообщения', 'Аудиозаписи']);
    expect(root.querySelectorAll('.vk-mobile-nav-item.is-active')).toHaveLength(1);
    expect(root.querySelector('.vk-mobile-nav-item.is-active')?.textContent).toContain('Новости');
  });

  it('follows the choice right away, badge and all', () => {
    mocks.unread = {count: 5, isMuted: false};
    const root = mountNav(() => <VKMobileNav active="settings" onSectionChange={vi.fn()} />);

    addVKMobileNavSection('settings');
    expect(tabTitles(root)).toEqual(['Новости', 'Сообщения', 'Аудиозаписи', 'Настройки']);
    // the unread number sits on «Сообщения», wherever it stands
    moveVKMobileNavSection('settings', -1);
    moveVKMobileNavSection('settings', -1);
    moveVKMobileNavSection('settings', -1);
    expect(tabTitles(root)).toEqual(['Настройки', 'Новости', 'Сообщения', 'Аудиозаписи']);
    const messages = [...root.querySelectorAll('.vk-mobile-nav-item')]
      .find((el) => el.textContent?.includes('Сообщения'))!;
    expect(messages.querySelector('.vk-mobile-nav-item-badge')?.textContent).toBe('5');
    // the active tab is the one off the default place now
    expect(root.querySelector('.vk-mobile-nav-item.is-active')?.textContent).toContain('Настройки');
  });
});

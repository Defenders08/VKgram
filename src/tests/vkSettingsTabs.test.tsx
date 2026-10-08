import {afterEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import VKPageSettings from '@/vkgram/pages/VKPageSettings';
import {setVKSettingsRoute} from '@/vkgram/pages/settings/route';

vi.mock('@lib/rootScope', () => ({
  default: {myId: 1, managers: {}, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

// the pages behind the items are out of scope (and mount Web K's popup graph,
// which jsdom cannot hold): the stores answer «not ready yet», the contents are stubs
// (vi.hoisted: the mock factories are hoisted above plain consts)
const {notReady, stub} = vi.hoisted(() => ({
  notReady: (): (() => undefined) => () => undefined,
  stub: (): null => null
}));

vi.mock('@stores/peers', () => ({
  useUser: notReady
}));

vi.mock('@stores/fullPeers', () => ({
  useFullPeer: notReady
}));

vi.mock('@/vkgram/pages/settings/VKSettingsPrivacy', () => ({default: stub}));
vi.mock('@/vkgram/pages/settings/VKSettingsLanguage', () => ({default: stub}));
vi.mock('@/vkgram/pages/settings/VKSettingsSessions', () => ({default: stub}));
vi.mock('@/vkgram/pages/settings/VKSettingsConfig', () => ({default: stub}));
vi.mock('@/vkgram/pages/settings/VKSettingsMobileNav', () => ({default: stub}));
vi.mock('@/vkgram/pages/settings/VKGiftsPrivacy', () => ({default: stub}));
vi.mock('@/vkgram/pages/profile/VKProfileEditForm', () => ({default: stub}));
vi.mock('@/vkgram/pages/profile/VKProfileBirthday', () => ({default: stub}));
vi.mock('@/vkgram/pages/profile/VKProfilePersonalChannel', () => ({default: stub}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  setVKSettingsRoute({});
  vi.unstubAllGlobals();
});

const mount = (jsx: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

// jsdom has no matchMedia: the page's desktop signal starts from this answer
const stubWidth = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({matches, addEventListener() {}, removeEventListener() {}}));

const tab = (root: HTMLElement, title: string) =>
  [...root.querySelectorAll('[role="tab"]')].find((el) => el.textContent?.includes(title)) as HTMLButtonElement;

const openPanel = (root: HTMLElement) => root.querySelector('[role="tabpanel"]');

const itemTitles = (root: HTMLElement) =>
  [...openPanel(root)!.querySelectorAll('.vk-settings-item .vk-block-title')]
    .map((el) => el.textContent?.trim());

describe('VKPageSettings', () => {
  it('shows all the items of the category at once on a phone', () => {
    stubWidth(false);
    const root = mount(() => <VKPageSettings />);

    // only the mobile strip is mounted, the rail is not
    expect(root.querySelectorAll('[role="tab"]')).toHaveLength(7);
    // VKgram's own block is the second one: its tabs stand last on the strip
    expect(root.querySelectorAll('[role="tab"]')[5].textContent).toBe('Навбар');
    expect(root.querySelectorAll('[role="tab"]')[6].textContent).toBe('Приложение');
    expect(root.querySelector('.vk-settings-mobile-tabs')).toBeTruthy();
    expect(root.querySelector('.vk-settings-side')).toBeNull();

    expect(tab(root, 'Профиль').getAttribute('aria-selected')).toBe('true');
    expect(openPanel(root)?.id).toBe('vk-settings-panel-profile');
    // no row list to click through: every item's piece is in the panel
    expect(itemTitles(root)).toEqual(['Изменить профиль', 'Дата рождения', 'Личный канал']);
    expect(root.querySelectorAll('.vk-settings-row')).toHaveLength(0);
  });

  it('switches the whole panel from the strip', () => {
    stubWidth(false);
    const root = mount(() => <VKPageSettings />);

    tab(root, 'Приватность').click();
    expect(tab(root, 'Приватность').getAttribute('aria-selected')).toBe('true');
    expect(tab(root, 'Профиль').getAttribute('aria-selected')).toBe('false');
    expect(openPanel(root)?.id).toBe('vk-settings-panel-privacy');
    expect(openPanel(root)?.getAttribute('aria-labelledby')).toContain('vk-settings-mobile-tab-privacy');
    expect(itemTitles(root)?.[0]).toContain('Номер телефона');
  });

  it('stands the tabs in the right rail on desktop', () => {
    stubWidth(true);
    const root = mount(() => <VKPageSettings />);

    const rail = root.querySelector('.vk-settings-side');
    expect(rail).toBeTruthy();
    expect(root.querySelector('.vk-settings-mobile-tabs')).toBeNull();

    // two blocks: Telegram's settings first, VKgram's own under them
    const blocks = rail!.querySelectorAll('.vk-settings-side-block');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].querySelector('.vk-block-title')?.textContent).toBe('Телеграм');
    expect(blocks[0].querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(blocks[1].querySelector('.vk-block-title')?.textContent).toBe('VKgram');
    expect(blocks[1].querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(blocks[1].textContent).toContain('Навбар');
    expect(blocks[1].textContent).toContain('Приложение');
    // the panel is named by the rail's tabs
    expect(openPanel(root)?.getAttribute('aria-labelledby')).toBe(
      'vk-settings-mobile-tab-profile vk-settings-desktop-tab-profile'
    );

    // a tab of the Telegram block opens its category
    tab(root, 'Сессии').click();
    expect(tab(root, 'Сессии').getAttribute('aria-selected')).toBe('true');
    expect(tab(root, 'Профиль').getAttribute('aria-selected')).toBe('false');
    expect(openPanel(root)?.id).toBe('vk-settings-panel-sessions');
    expect(openPanel(root)?.textContent).toContain('Выйти из аккаунта');
  });

  it('opens the VKgram category with its content right away', () => {
    stubWidth(false);
    const root = mount(() => <VKPageSettings />);

    tab(root, 'Приложение').click();
    expect(tab(root, 'Приложение').getAttribute('aria-selected')).toBe('true');
    expect(openPanel(root)?.id).toBe('vk-settings-panel-app');
    expect(itemTitles(root)).toEqual(['Экспорт и импорт настроек']);
  });

  it('opens the navbar category as one piece', () => {
    stubWidth(false);
    const root = mount(() => <VKPageSettings />);

    tab(root, 'Навбар').click();
    expect(tab(root, 'Навбар').getAttribute('aria-selected')).toBe('true');
    expect(tab(root, 'Профиль').getAttribute('aria-selected')).toBe('false');
    expect(openPanel(root)?.id).toBe('vk-settings-panel-navbar');
    expect(openPanel(root)?.getAttribute('aria-labelledby')).toContain('vk-settings-mobile-tab-navbar');
  });
});

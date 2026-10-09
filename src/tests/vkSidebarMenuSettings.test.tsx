import {afterEach, describe, expect, it} from 'vitest';
import {render} from 'solid-js/web';
import VKSettingsSidebarMenu from '@/vkgram/pages/settings/VKSettingsSidebarMenu';
import {
  isDefaultVKSidebarMenuSettings,
  resetVKSidebarMenuSettings,
  setVKSidebarMenuSectionVisible,
  vkSidebarMenuSettings,
  VK_SIDEBAR_MENU_SECTIONS
} from '@/vkgram/pages/settings/sidebarMenu';

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  resetVKSidebarMenuSettings();
});

const mount = () => {
  dispose.push(render(() => <VKSettingsSidebarMenu />, document.body));
  return document.body;
};

const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.vk-header-settings-block')];

const rowOf = (root: HTMLElement, title: string) =>
  rows(root).find((row) => row.textContent?.includes(title))!;

const checkboxOf = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input[type="checkbox"]')!;

describe('VKSettingsSidebarMenu', () => {
  it('lists every section the menu can hold, «Настройки» is not among them', () => {
    const root = mount();

    expect(VK_SIDEBAR_MENU_SECTIONS.map((section) => section.id)).not.toContain('settings');
    expect(rows(root)).toHaveLength(VK_SIDEBAR_MENU_SECTIONS.length);
    for(const section of VK_SIDEBAR_MENU_SECTIONS) {
      expect(rowOf(root, section.title)).toBeTruthy();
    }
    // no row of the list is «Настройки» (the note below the list mentions it)
    expect(rowOf(root, 'Настройки')).toBeUndefined();
  });

  it('every checkbox follows the current choice, unchecking hides the section at once', () => {
    const root = mount();

    for(const row of rows(root)) {
      expect(checkboxOf(row).checked).toBe(true);
      expect(row.classList.contains('is-hidden')).toBe(false);
    }

    checkboxOf(rowOf(root, 'Аудиозаписи')).click();
    expect(vkSidebarMenuSettings().hidden).toEqual(['audio']);
    const audio = rowOf(root, 'Аудиозаписи');
    expect(checkboxOf(audio).checked).toBe(false);
    expect(audio.classList.contains('is-hidden')).toBe(true);

    // the others keep their ticks
    expect(checkboxOf(rowOf(root, 'Новости')).checked).toBe(true);
  });

  it('checking a hidden row brings the section back', () => {
    setVKSidebarMenuSectionVisible('docs', false);
    const root = mount();

    const docs = rowOf(root, 'Документы');
    expect(checkboxOf(docs).checked).toBe(false);
    checkboxOf(docs).click();
    expect(vkSidebarMenuSettings().hidden).toEqual([]);
    expect(checkboxOf(rowOf(root, 'Документы')).checked).toBe(true);
  });

  it('«Сбросить» is dimmed on the default choice and brings every section back', () => {
    const root = mount();
    const reset = [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Сбросить')!;

    expect(isDefaultVKSidebarMenuSettings()).toBe(true);
    expect(reset.disabled).toBe(true);

    setVKSidebarMenuSectionVisible('friends', false);
    expect(reset.disabled).toBe(false);

    reset.click();
    expect(vkSidebarMenuSettings().hidden).toEqual([]);
    expect(reset.disabled).toBe(true);
  });
});


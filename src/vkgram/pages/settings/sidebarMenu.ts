import {createVKConfigSection, isPlainObject} from '@/vkgram/config';
import {getVKSections, VKSectionId} from '@/vkgram/sections';

/**
 * «Левое меню» — which sections the left menu shows («Настройки» → «Левое
 * меню»): the desktop sidebar and the ☰ drawer of the phone are the same menu,
 * so one choice covers both. A section of the VKgram config, so the choice is
 * exported and imported with the rest (see `vkgram/config.ts`).
 *
 * Only what the menu holds can be toggled: «Группы» has never stood in it, and
 * «Настройки» stays always — it is the way back into this very screen.
 */
export const VK_SIDEBAR_MENU_SECTIONS = getVKSections([
  'profile', 'news', 'messages', 'friends', 'channels', 'audio', 'photos', 'videos', 'docs', 'apps', 'telegram'
]);

export type VKSidebarMenuSettings = {
  hidden: VKSectionId[]
};

const isMenuSectionId = (value: unknown): value is VKSectionId =>
  typeof value === 'string' && VK_SIDEBAR_MENU_SECTIONS.some((section) => section.id === value);

// dedupe, drop what is not a section of the menu
const cleanHidden = (raw: unknown[]): VKSectionId[] => {
  const ids: VKSectionId[] = [];
  for(const item of raw) {
    if(isMenuSectionId(item) && !ids.includes(item)) ids.push(item);
  }
  return ids;
};

// a field of the wrong type is not a choice: the default decides
const parse = (raw: unknown): VKSidebarMenuSettings | undefined => {
  if(!isPlainObject(raw)) return undefined;
  if(!Array.isArray(raw.hidden)) return {hidden: []};
  return {hidden: cleanHidden(raw.hidden)};
};

const section = createVKConfigSection<VKSidebarMenuSettings>({
  key: 'sidebarMenu',
  title: 'Левое меню',
  defaults: {hidden: []},
  parse
});

export const vkSidebarMenuSettings = section.value;

export const resetVKSidebarMenuSettings = section.reset;

// not the section's own `isDefault`: the choice is an array, and the generic one
// compares it by reference — everything is the default exactly when nothing is hidden
export const isDefaultVKSidebarMenuSettings = () => vkSidebarMenuSettings().hidden.length === 0;

/** Shows or hides a section of the left menu (no-op when it is already so or the section cannot be hidden). */
export function setVKSidebarMenuSectionVisible(id: VKSectionId, visible: boolean) {
  if(!VK_SIDEBAR_MENU_SECTIONS.some((section) => section.id === id)) return;
  const hidden = vkSidebarMenuSettings().hidden;
  if(visible === !hidden.includes(id)) return;
  section.set({hidden: visible ? hidden.filter((kept) => kept !== id) : [...hidden, id]});
}

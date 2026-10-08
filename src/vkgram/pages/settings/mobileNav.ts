import {createVKConfigSection, isPlainObject} from '@/vkgram/config';
import {VK_SECTIONS, VKSectionId} from '@/vkgram/sections';

/**
 * «Навбар» — the bottom navigation of the mobile layout: which sections stand
 * on it and in which order («Настройки» → «Навбар»). A section of the VKgram
 * config, so the choice is exported and imported with the rest (see
 * `vkgram/config.ts`). The bar keeps its room to breathe — from MIN to MAX
 * tabs; what is not on the bar stays in the side menu (☰ of the header).
 */
export const VK_MOBILE_NAV_MIN = 3;
export const VK_MOBILE_NAV_MAX = 5;

// the three things a phone is used for — what the bar showed before there was a choice
export const VK_MOBILE_NAV_DEFAULT: VKSectionId[] = ['news', 'messages', 'audio'];

export type VKMobileNavSettings = {
  sections: VKSectionId[]
};

const isSectionId = (value: unknown): value is VKSectionId =>
  typeof value === 'string' && VK_SECTIONS.some((section) => section.id === value);

// dedupe, drop what is not a section, keep no more than the bar fits
const cleanSections = (raw: unknown[]): VKSectionId[] => {
  const ids: VKSectionId[] = [];
  for(const item of raw) {
    if(ids.length >= VK_MOBILE_NAV_MAX) break;
    if(isSectionId(item) && !ids.includes(item)) ids.push(item);
  }
  return ids;
};

// a field of the wrong type is not a choice: the default decides
const parse = (raw: unknown): VKMobileNavSettings | undefined => {
  if(!isPlainObject(raw)) return undefined;
  if(!Array.isArray(raw.sections)) return {sections: [...VK_MOBILE_NAV_DEFAULT]};
  const ids = cleanSections(raw.sections);
  // a half-empty bar is not a choice either
  return {sections: ids.length >= VK_MOBILE_NAV_MIN ? ids : [...VK_MOBILE_NAV_DEFAULT]};
};

const section = createVKConfigSection<VKMobileNavSettings>({
  key: 'mobileNav',
  title: 'Мобильный навбар',
  defaults: {sections: [...VK_MOBILE_NAV_DEFAULT]},
  parse
});

export const vkMobileNavSettings = section.value;

export const isDefaultVKMobileNavSettings = section.isDefault;

/** Back to the three default tabs; the saved choice is dropped. */
export const resetVKMobileNavSettings = section.reset;

/** Puts a section on the bar (no-op when it is there already or the bar is full). */
export function addVKMobileNavSection(id: VKSectionId) {
  const sections = vkMobileNavSettings().sections;
  if(sections.includes(id) || sections.length >= VK_MOBILE_NAV_MAX) return;
  section.set({sections: [...sections, id]});
}

/** Takes a section off the bar (no-op when the minimum is reached). */
export function removeVKMobileNavSection(id: VKSectionId) {
  const sections = vkMobileNavSettings().sections;
  if(sections.length <= VK_MOBILE_NAV_MIN || !sections.includes(id)) return;
  section.set({sections: sections.filter((kept) => kept !== id)});
}

/** One place up (`-1`) or down (`1`) on the bar. */
export function moveVKMobileNavSection(id: VKSectionId, shift: -1 | 1) {
  const sections = [...vkMobileNavSettings().sections];
  const index = sections.indexOf(id);
  const target = index + shift;
  if(index < 0 || target < 0 || target >= sections.length) return;

  [sections[index], sections[target]] = [sections[target], sections[index]];
  section.set({sections});
}

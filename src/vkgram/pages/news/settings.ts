import {createVKConfigSection, isPlainObject} from '@/vkgram/config';

/**
 * The settings of the «Новости» feed — a section («news») of the VKgram config,
 * so they can be exported and imported with the rest (see `vkgram/config.ts`).
 * `hideArchived` / `hideMuted` — leave out the channels in the archive / with
 * notifications off. By default only the archive is left out: muted channels
 * are the user's to hide (a muted channel is often still one to read). `scope` — where that applies: `main` is «Все» only, the
 * folders show what is in them; `all` — the folders too.
 */
export type VKNewsSettings = {
  hideArchived: boolean,
  hideMuted: boolean,
  hidePeople: boolean, // hide people only in the News stories strip
  scope: 'main' | 'all'
};

// the archive is left out, in «Все» and in the folders alike; muted channels stay
const DEFAULTS: VKNewsSettings = {hideArchived: true, hideMuted: false, hidePeople: false, scope: 'all'};

// a field of the wrong type is not a choice: the default decides
const parse = (raw: unknown): VKNewsSettings | undefined => {
  if(!isPlainObject(raw)) return undefined;
  return {
    hideArchived: typeof raw.hideArchived === 'boolean' ? raw.hideArchived : DEFAULTS.hideArchived,
    hideMuted: typeof raw.hideMuted === 'boolean' ? raw.hideMuted : DEFAULTS.hideMuted,
    hidePeople: typeof raw.hidePeople === 'boolean' ? raw.hidePeople : DEFAULTS.hidePeople,
    scope: raw.scope === 'main' || raw.scope === 'all' ? raw.scope : DEFAULTS.scope
  };
};

// Before the config these lived in their own key. Before its version 2, «hide muted» was on by
// default and was saved together with everything else, so a saved `true` did not have to be a
// choice; it is not carried over, the default decides.
const LEGACY_VERSION = 2;
const parseLegacy = (raw: unknown): VKNewsSettings | undefined => {
  const settings = parse(raw);
  if(!settings) return undefined;
  if((raw as {v?: unknown}).v !== LEGACY_VERSION) settings.hideMuted = DEFAULTS.hideMuted;
  return settings;
};

const section = createVKConfigSection<VKNewsSettings>({
  key: 'news',
  title: 'Новости',
  defaults: DEFAULTS,
  parse,
  legacy: {storageKey: 'vkgram-news-settings', parse: parseLegacy}
});

export const vkNewsSettings = section.value;

export const isDefaultVKNewsSettings = section.isDefault;

/** Back to the defaults; the saved choice is dropped, so the defaults stay the app's to change. */
export const resetVKNewsSettings = section.reset;

export const updateVKNewsSettings = section.update;

import {createVKConfigSection, isPlainObject} from '@/vkgram/config';

/**
 * The settings of the «Сообщения» dialog list — the same filters as the feed
 * settings of «Новости», for dialogs. A section («messages») of the VKgram
 * config, so they can be exported and imported with the rest (see `vkgram/config.ts`).
 * `hideArchived` / `hideMuted` — leave out the dialogs in the archive / with
 * notifications off. `hideChannels` — leave out the channels the user can write to
 * (the owner / an admin that may post): they are in the list, other channels never are. `scope` — where that applies: `main` is «Все» only, the
 * other tabs show what is in them; `all` — the other tabs too. The «Архив» tab
 * is never filtered: it is the archive itself.
 *
 * By default only the archive is left out, which is how the list worked before
 * the settings existed («Все» never had the archived dialogs).
 */
export type VKMessagesSettings = {
  hideArchived: boolean,
  hideMuted: boolean,
  hideChannels: boolean,
  scope: 'main' | 'all'
};

const DEFAULTS: VKMessagesSettings = {hideArchived: true, hideMuted: false, hideChannels: false, scope: 'all'};

// a field of the wrong type is not a choice: the default decides
const parse = (raw: unknown): VKMessagesSettings | undefined => {
  if(!isPlainObject(raw)) return undefined;
  return {
    hideArchived: typeof raw.hideArchived === 'boolean' ? raw.hideArchived : DEFAULTS.hideArchived,
    hideMuted: typeof raw.hideMuted === 'boolean' ? raw.hideMuted : DEFAULTS.hideMuted,
    hideChannels: typeof raw.hideChannels === 'boolean' ? raw.hideChannels : DEFAULTS.hideChannels,
    scope: raw.scope === 'main' || raw.scope === 'all' ? raw.scope : DEFAULTS.scope
  };
};

const section = createVKConfigSection<VKMessagesSettings>({
  key: 'messages',
  title: 'Сообщения',
  defaults: DEFAULTS,
  parse,
  // before the config these lived in their own key
  legacy: {storageKey: 'vkgram-messages-settings', parse}
});

export const vkMessagesSettings = section.value;

export const isDefaultVKMessagesSettings = section.isDefault;

/** Back to the defaults; the saved choice is dropped. */
export const resetVKMessagesSettings = section.reset;

export const updateVKMessagesSettings = section.update;

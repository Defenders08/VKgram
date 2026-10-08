import {Accessor, createRoot, createSignal} from 'solid-js';

/**
 * The configuration of VKgram: the settings of the app's own screens
 * («Настройки ленты», «Настройки диалогов», …) kept in ONE place and in ONE
 * format, so they can be saved to a file and brought back
 * («Настройки» → «Приложение» → «Экспорт и импорт»).
 *
 * Where it lives: `localStorage['vkgram-config']` = `{v, sections: {<key>: <value>}}`.
 * Every screen with settings owns a section (`createVKConfigSection`) and reads
 * and writes only that; the section registers itself here, which is how export
 * and import know about it — a new screen needs no change in this file.
 *
 * The file: `{app: 'vkgram', type: 'config', version, exportedAt, settings: {<key>: <value>}}`.
 * What the file brings is never trusted: every section is parsed by its own
 * `parse` (fields of the wrong type fall back to the defaults, unknown fields
 * are dropped) before anything is changed.
 */

export const VK_CONFIG_APP = 'vkgram';
export const VK_CONFIG_TYPE = 'config';
// bump when the shape of the file changes in a way the older code can't read
export const VK_CONFIG_VERSION = 1;

const STORAGE_KEY = 'vkgram-config';

export type VKConfigFile = {
  app: typeof VK_CONFIG_APP,
  type: typeof VK_CONFIG_TYPE,
  version: number,
  exportedAt: string,
  settings: {[key: string]: unknown}
};

type RegisteredSection = {
  key: string,
  title: string,
  // the current value (always whole and valid)
  get: () => unknown,
  // `undefined` when `raw` is not a value of this section at all
  parse: (raw: unknown) => unknown | undefined,
  set: (value: unknown) => void,
  reset: () => void
};

const registry = new Map<string, RegisteredSection>();

function readStorage(): {[key: string]: unknown} {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && typeof saved.sections === 'object' && saved.sections ? saved.sections : {};
  } catch{
    return {};
  }
}

function writeStorage(sections: {[key: string]: unknown}) {
  try {
    if(Object.keys(sections).length) localStorage.setItem(STORAGE_KEY, JSON.stringify({v: VK_CONFIG_VERSION, sections}));
    else localStorage.removeItem(STORAGE_KEY);
  } catch{}
}

/** Saves (or, with `undefined`, drops) one section; the others stay as they are. */
function saveSection(key: string, value: unknown) {
  const sections = readStorage();
  if(value === undefined) delete sections[key];
  else sections[key] = value;
  writeStorage(sections);
}

export const isPlainObject = (raw: unknown): raw is {[key: string]: unknown} => {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw);
};

/**
 * One section of the config. `defaults` are what the app does without any
 * choice (they are never saved: a reset drops the section). `legacy` — where
 * the same settings were kept before the config existed: read once, moved into
 * the config, and the old key is removed.
 */
export function createVKConfigSection<T extends {[key: string]: unknown}>(options: {
  key: string,
  title: string,
  defaults: T,
  parse: (raw: unknown) => T | undefined,
  legacy?: {storageKey: string, parse: (raw: unknown) => T | undefined}
}) {
  const {key, defaults, parse} = options;

  let initial = parse(readStorage()[key]);
  if(options.legacy) {
    if(!initial) {
      try {
        initial = options.legacy.parse(JSON.parse(localStorage.getItem(options.legacy.storageKey)));
      } catch{}
      if(initial) saveSection(key, initial);
    }
    // gone either way: a leftover would come back after a reset
    try {
      localStorage.removeItem(options.legacy.storageKey);
    } catch{}
  }

  // module-level: the choice outlives the page and comes back with the next visit
  const [value, setValue] = createRoot(() => createSignal<T>(initial ?? {...defaults}));

  const set = (next: T) => {
    setValue(() => next);
    saveSection(key, next);
  };
  const reset = () => {
    setValue(() => ({...defaults}));
    saveSection(key, undefined);
  };

  registry.set(key, {
    key,
    title: options.title,
    get: value,
    parse,
    set: set as (value: unknown) => void,
    reset
  });

  return {
    value: value as Accessor<T>,
    set,
    update: (patch: Partial<T>) => set({...value(), ...patch}),
    reset,
    isDefault: () => (Object.keys(defaults) as (keyof T)[]).every((field) => value()[field] === defaults[field])
  };
}

// * Export / import

export const getVKConfigSections = () => [...registry.values()].map(({key, title}) => ({key, title}));

/** The whole current config, as the file would hold it. */
export function exportVKConfig(): VKConfigFile {
  const settings: {[key: string]: unknown} = {};
  for(const section of registry.values()) settings[section.key] = section.get();
  return {
    app: VK_CONFIG_APP,
    type: VK_CONFIG_TYPE,
    version: VK_CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    settings
  };
}

export type VKConfigImportResult =
  | {ok: true, applied: string[], skipped: string[]}
  | {ok: false, error: string};

/**
 * Reads a config file's text and, only when all of it checks out, applies it.
 * Sections that are in the file and known here are replaced; known sections
 * that are not in the file stay as they are; sections this version does not
 * know are skipped (reported, not applied). A section that is in the file but
 * is not a valid one fails the whole import — nothing is half-applied.
 */
export function importVKConfig(text: string): VKConfigImportResult {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch{
    return {ok: false, error: 'Файл не похож на настройки VKgram: это не JSON.'};
  }

  if(!isPlainObject(file) || file.app !== VK_CONFIG_APP || file.type !== VK_CONFIG_TYPE) {
    return {ok: false, error: 'Файл не похож на настройки VKgram.'};
  }
  if(typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) {
    return {ok: false, error: 'В файле не указана версия настроек.'};
  }
  if(file.version > VK_CONFIG_VERSION) {
    return {ok: false, error: 'Файл создан более новой версией VKgram — эту версию он не поддерживает.'};
  }
  if(!isPlainObject(file.settings)) {
    return {ok: false, error: 'В файле нет настроек.'};
  }

  const parsed: {section: RegisteredSection, value: unknown}[] = [];
  const skipped: string[] = [];
  for(const [key, raw] of Object.entries(file.settings)) {
    const section = registry.get(key);
    if(!section) {
      skipped.push(key);
      continue;
    }

    const value = section.parse(raw);
    if(value === undefined) {
      return {ok: false, error: `Раздел «${section.title}» в файле повреждён. Ничего не изменено.`};
    }
    parsed.push({section, value});
  }

  if(!parsed.length) return {ok: false, error: 'В файле нет настроек, которые знает эта версия VKgram.'};

  for(const {section, value} of parsed) section.set(value);
  return {ok: true, applied: parsed.map(({section}) => section.title), skipped};
}

/** Every section back to its defaults. */
export function resetVKConfig() {
  for(const section of registry.values()) section.reset();
}

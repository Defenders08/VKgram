import I18n from '@lib/langPack';
import type {LangPackDifference} from '@layer';

// VKgram starts in Russian on the first launch. After the user explicitly
// chooses a language in Settings, VKgram must never override that choice.
export const VKGRAM_DEFAULT_LANG = 'ru';
export const VKGRAM_LANG_CHOSEN_KEY = 'vkgram-lang-chosen';

// New key so old experimental versions cannot make the fixed implementation
// think that the first-launch migration has already happened. v4: caches saved by
// dev builds carry English strings written over the Russian pack (the TEST_LOCAL
// override in langPack.ts) — the bump forces one clean refetch to rewrite them.
const VKGRAM_DEFAULT_LANG_APPLIED_KEY = 'vkgram-default-lang-applied-v4';

export function isVKgramLanguageChosen(): boolean {
  try {
    return localStorage.getItem(VKGRAM_LANG_CHOSEN_KEY) === '1';
  } catch(err) {
    return false;
  }
}

export function markVKgramLanguageChosen() {
  try {
    localStorage.setItem(VKGRAM_LANG_CHOSEN_KEY, '1');
  } catch(err) {}
}

function isDefaultLanguageApplied(): boolean {
  try {
    return localStorage.getItem(VKGRAM_DEFAULT_LANG_APPLIED_KEY) === '1';
  } catch(err) {
    return false;
  }
}

function markDefaultLanguageApplied() {
  try {
    localStorage.setItem(VKGRAM_DEFAULT_LANG_APPLIED_KEY, '1');
  } catch(err) {}
}

/**
 * Apply Russian once, before Web K restores/applies its cached language pack.
 *
 * Returns the exact pack that was applied so index.ts can continue booting with
 * that pack instead of calling getCacheLangPackAndApply() and applying another
 * (possibly stale) cached pack immediately afterwards.
 */
export async function applyVKgramDefaultLanguage(): Promise<LangPackDifference | undefined> {
  if(isVKgramLanguageChosen() || isDefaultLanguageApplied()) return undefined;

  try {
    console.info('[VKgram lang] first launch: applying Russian');

    // ignoreCache=true is intentional: the first-launch default must not reuse
    // an old cached Web K pack. getLangPackAndApply() also saves the resulting
    // Russian pack, so subsequent boots can use the normal cache path.
    const langPack = await I18n.getLangPackAndApply(VKGRAM_DEFAULT_LANG, true, true);

    if(langPack.lang_code?.split('-')[0] !== VKGRAM_DEFAULT_LANG) {
      console.warn('[VKgram lang] Russian was requested but another language was applied:', langPack.lang_code);
      return undefined;
    }

    markDefaultLanguageApplied();
    console.info('[VKgram lang] Russian applied successfully');
    return langPack;
  } catch(err) {
    console.warn('[VKgram lang] could not apply the default language', err);
    return undefined;
  }
}

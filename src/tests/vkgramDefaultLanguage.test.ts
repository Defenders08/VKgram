import {readFileSync} from 'node:fs';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const {getLangPackAndApply} = vi.hoisted(() => ({getLangPackAndApply: vi.fn()}));

vi.mock('@lib/langPack', () => ({default: {getLangPackAndApply}}));

describe('VKgram default language', () => {
  beforeEach(() => {
    localStorage.clear();
    getLangPackAndApply.mockReset();
    vi.resetModules();
  });

  it('applies Russian with ignoreCache on first launch and marks the migration', async() => {
    getLangPackAndApply.mockResolvedValue({lang_code: 'ru'});
    const {applyVKgramDefaultLanguage} = await import('@/vkgram/language');

    const pack = await applyVKgramDefaultLanguage();

    expect(getLangPackAndApply).toHaveBeenCalledWith('ru', true, true);
    expect(pack).toEqual({lang_code: 'ru'});
    expect(localStorage.getItem('vkgram-default-lang-applied-v4')).toBe('1');
  });

  it('does not run again once the default has been applied', async() => {
    localStorage.setItem('vkgram-default-lang-applied-v4', '1');
    const {applyVKgramDefaultLanguage} = await import('@/vkgram/language');

    expect(await applyVKgramDefaultLanguage()).toBeUndefined();
    expect(getLangPackAndApply).not.toHaveBeenCalled();
  });

  it('never overrides a language the user picked in Settings', async() => {
    localStorage.setItem('vkgram-lang-chosen', '1');
    const {applyVKgramDefaultLanguage} = await import('@/vkgram/language');

    expect(await applyVKgramDefaultLanguage()).toBeUndefined();
    expect(getLangPackAndApply).not.toHaveBeenCalled();
  });

  it('does not mark the migration when the fetched pack is not Russian', async() => {
    getLangPackAndApply.mockResolvedValue({lang_code: 'en'});
    const {applyVKgramDefaultLanguage} = await import('@/vkgram/language');

    expect(await applyVKgramDefaultLanguage()).toBeUndefined();
    expect(localStorage.getItem('vkgram-default-lang-applied-v4')).toBeNull();
  });

  it('survives a failed fetch without marking the migration', async() => {
    getLangPackAndApply.mockRejectedValue(new Error('network'));
    const {applyVKgramDefaultLanguage} = await import('@/vkgram/language');

    expect(await applyVKgramDefaultLanguage()).toBeUndefined();
    expect(localStorage.getItem('vkgram-default-lang-applied-v4')).toBeNull();
  });
});

describe('langPack TEST_LOCAL', () => {
  // The local pack is English while VKgram defaults to Russian: with TEST_LOCAL
  // on, dev builds append the local English strings AFTER the server's and pin
  // the whole Telegram UI to English (VKgram's own labels stay Russian).
  it('stays off in dev builds', () => {
    const source = readFileSync('src/lib/langPack.ts', 'utf8');
    expect(source).toMatch(/const TEST_LOCAL = IS_BETA && false;/);
  });
});

// * Startup state of VKgram. Deliberately dependency-free: it is imported by
// * `src/index.ts` at the very start of the boot, so nothing heavy comes along.

export const VKGRAM_SPLASH_ID = 'vkgram-splash';

const BOOT_STYLE_ID = 'vkgram-boot-style';
// the longest the original UI may stay covered if nothing ever calls `removeVKgramSplash`
const BOOT_FAILSAFE_MS = 15000;

/**
 * The same contract the inline script of `index.html` uses when it decides
 * whether the splash should ever be shown. A `?vkgram=0` (or the localStorage
 * kill switch) keeps the plain Web K UI, which then boots exactly as upstream.
 */
export function isVKgramEnabled(): boolean {
  try {
    if(new URLSearchParams(location.search).get('vkgram') === '0') return false;
    if(localStorage.getItem('vkgram-disabled') === '1') return false;
  } catch(err) {}
  return true;
}

/**
 * Removes the boot splash. Called when something take over the screen:
 * the VKgram layout has mounted (the fade lets its first painted frame in),
 * the auth flow has mounted, the popup sandbox took over, or the instance
 * was deactivated. Safe to call several times — the splash removes itself
 * after the fade, and a missing one is a no-op.
 */
export function removeVKgramSplash(): void {
  document.documentElement.classList.remove('vkgram-booting');
  document.getElementById(SWITCH_COVER_ID)?.remove();
  const el = document.getElementById(VKGRAM_SPLASH_ID);
  if(!el) return;
  if(el.classList.contains('is-done')) return;
  el.classList.add('is-done');
  setTimeout(() => el.remove(), 240);
}

const SWITCH_COVER_ID = 'vkgram-switch-cover';
// the longest the switch cover may stay if the reload it covers never happens
const SWITCH_COVER_FAILSAFE_MS = 8000;

/**
 * «Добавить аккаунт» in the same tab and «Выйти»: Web K swaps the session (its theme, its chat wallpaper,
 * the auth shell) a moment before the page reloads or the login mounts, and for that moment the original
 * Telegram background shows through the VKgram page. This puts a VKgram-colored layer over the whole window right away; the reload takes the
 * page away with it and the boot cover (`coverOriginalUntilMounted`) carries on from there.
 * Returns the function that removes the layer (the switch failed, or no reload followed).
 */
export function coverForSessionChange(): () => void {
  if(typeof document === 'undefined') return () => {};

  let el = document.getElementById(SWITCH_COVER_ID);
  if(!el) {
    el = document.createElement('div');
    el.id = SWITCH_COVER_ID;
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#edeef0;';
    document.body.appendChild(el);
  }

  const cover = el;
  const uncover = () => cover.remove();
  setTimeout(uncover, SWITCH_COVER_FAILSAFE_MS);
  return uncover;
}

/**
 * Until VKgram owns the screen (its layout or its login page is mounted), nothing of the original Web K
 * may show: not its chat wallpaper (the green Telegram pattern that used to flash between the splash and
 * the first VKgram frame, and under the login page), not the `#page-chats` shell it builds before the
 * layout takes it over. The page is the VKgram color instead.
 *
 * Runs when this module is imported — the very start of the boot — and is lifted by `removeVKgramSplash`
 * (the `vkgram-booting` class). A timer lifts it anyway, so a boot that never reaches VKgram can't leave
 * the screen covered.
 */
function coverOriginalUntilMounted(): void {
  if(typeof document === 'undefined') return;
  if(!isVKgramEnabled()) {
    // the stylesheet hides Web K's own background from the first paint; with VKgram off it must not
    document.documentElement.classList.add('vkgram-off');
    return;
  }
  const root = document.documentElement;
  root.classList.add('vkgram-booting');

  if(!document.getElementById(BOOT_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = BOOT_STYLE_ID;
    style.textContent = `
      html.vkgram-booting,
      html.vkgram-booting body {
        background: #edeef0 !important;
        background-image: none !important;
      }
      html.vkgram-booting body > [class*="chat-background"],
      html.vkgram-booting body > #page-chats,
      html.vkgram-booting body > .page-chats,
      html.vkgram-booting body > #auth-pages,
      html.vkgram-booting body > .whole {
        display: none !important;
      }
    `;
    (document.head || root).appendChild(style);
  }

  setTimeout(removeVKgramSplash, BOOT_FAILSAFE_MS);
}

coverOriginalUntilMounted();

/**
 * Web K picks its first interface language from the browser's. Until the person picks a language
 * in VKgram's settings, the browser reports Russian to the app, so a fresh start (the login page
 * included) is Russian from the first string. This module runs before every other one.
 */
function forceRussianBrowserLanguage(): void {
  if(typeof navigator === 'undefined') return;
  try {
    if(!isVKgramEnabled()) return;
    if(localStorage.getItem('vkgram-lang-chosen') === '1') return;
    Object.defineProperty(navigator, 'language', {configurable: true, get: () => 'ru'});
    Object.defineProperty(navigator, 'languages', {configurable: true, get: () => ['ru']});
  } catch(err) {}
}

forceRussianBrowserLanguage();

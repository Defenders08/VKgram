import {createEffect, createRoot, createSignal} from 'solid-js';

/** The brand of the tab title and the wordmarks. */
export const VKGRAM_BRAND = 'VKGRAM';

const [part, setPart] = createRoot(() => createSignal<string>());

let started = false;

const apply = () => {
  document.title = part() ? `${VKGRAM_BRAND} - ${part()}` : VKGRAM_BRAND;
};

/**
 * The tab title of VKgram: `VKGRAM - <часть>`. One signal for every screen that
 * can hold the tab — the login page («Вход») and the IM layout (the open
 * section) — so whoever mounted last always wins, and nothing races to write
 * the title while VKgram is up.
 *
 * The title is written right away (a screen owns the tab the moment it mounts);
 * the effect only keeps it in sync with the section changes afterwards. The
 * writing effect is created by the first VKgram screen that mounts, not at
 * import: this module may be imported with VKgram disabled (`?vkgram=0`), and
 * then the title stays whatever Web K keeps it as.
 */
export function startVKgramDocumentTitle(initial?: string) {
  if(!started) {
    started = true;
    createRoot(() => createEffect(apply));
  }
  setPart(initial);
  apply();
}

/** The part after `VKGRAM - `; `undefined` leaves the brand alone. */
export const setVKgramDocumentTitle = setPart;

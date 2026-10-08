import {createRoot, createSignal} from 'solid-js';

/**
 * «Настроить» of «Новостей»: the merged settings of the feed and of the
 * folders, in one window. The signal is module-level: the icon in the mobile
 * top bar (`VKHeader`) and the page's own links («Настройки ленты» in the
 * empty states) open the window the page hosts (`VKNewsCustomizeModal`) —
 * the bar and the page are separate component trees.
 */
const [isOpen, setOpen] = createRoot(() => createSignal(false));

// the top bar has nothing to read — it only opens the window
export const setNewsCustomizeOpen = setOpen;

export default function useNewsCustomize() {
  return [isOpen, setOpen] as const;
}

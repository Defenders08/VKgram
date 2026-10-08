import {createRoot, createSignal} from 'solid-js';

/**
 * «Настроить» of «Сообщений»: the merged settings of the dialogs and of the
 * folders, in one window. The signal is module-level: the icon in the mobile
 * top bar (`VKHeader`) and the page's own links («Настройки диалогов» in the
 * empty state) open the window the page hosts (`VKMessagesCustomizeModal`) —
 * the bar and the page are separate component trees.
 */
const [isOpen, setOpen] = createRoot(() => createSignal(false));

// the top bar has nothing to read — it only opens the window
export const setMessagesCustomizeOpen = setOpen;

export default function useMessagesCustomize() {
  return [isOpen, setOpen] as const;
}

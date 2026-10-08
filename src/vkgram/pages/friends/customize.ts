import {createRoot, createSignal} from 'solid-js';

/**
 * «Настроить» of «Друзей»: the management of the Telegram folders and of the
 * local ones, in one window. The signal is module-level: the icon in the
 * mobile top bar (`VKHeader`) opens the window the page hosts
 * (`VKFoldersCustomizeModal`) — the bar and the page are separate component
 * trees.
 */
const [isOpen, setOpen] = createRoot(() => createSignal(false));

// the top bar has nothing to read — it only opens the window
export const setFriendsCustomizeOpen = setOpen;

export default function useFriendsCustomize() {
  return [isOpen, setOpen] as const;
}

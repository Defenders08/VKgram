import {createRoot, createSignal} from 'solid-js';

/**
 * «Настроить» of «Аудиозаписей»: the management of the audio folders, in one
 * window. The signal is module-level: the icon in the mobile top bar
 * (`VKHeader`) opens the window the page hosts (`VKAudioCustomizeModal`) —
 * the bar and the page are separate component trees.
 */
const [isOpen, setOpen] = createRoot(() => createSignal(false));

// the top bar has nothing to read — it only opens the window
export const setAudioCustomizeOpen = setOpen;

export default function useAudioCustomize() {
  return [isOpen, setOpen] as const;
}

import {createEffect, createSignal, onCleanup, Show} from 'solid-js';
import VKIcon from '@/vkgram/components/VKIcons';
import VKModal from '@/vkgram/components/VKModal';
import VKHomeBlocksSettings from '@/vkgram/components/VKHomeBlocksSettings';

// as long as the leaving of the panel (see `vk-settings-out`)
const CLOSE_DELAY = 140;

/**
 * «Настройки» of the main page: the gear in the top bar, right of the search, and the small
 * panel that drops from it (the look of «Настройки ленты»: a white card with a bold title and a
 * thin divider). It holds the blocks of «Моя страница» (`VKHomeBlocksSettings`). The panel closes
 * on a click outside and on Escape, the focus goes back to the gear.
 */
export default function VKHeaderSettings() {
  // `isOpen` is the choice, `isMounted` is the panel in the page: it stays a moment after the
  // closing to be seen leaving
  const [isOpen, setOpen] = createSignal(false);
  const [isMounted, setMounted] = createSignal(false);
  let root: HTMLDivElement;
  let button: HTMLButtonElement;

  createEffect(() => {
    if(isOpen()) {
      setMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), CLOSE_DELAY);
    onCleanup(() => window.clearTimeout(timeout));
  });

  createEffect(() => {
    if(!isOpen()) return;

    const onPointerDown = (e: PointerEvent) => {
      if(!root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'Escape' || !isOpen()) return;
    e.stopPropagation();
    setOpen(false);
    button.focus();
  };

  return (
    <div class="vk-header-settings">
      <div ref={root} class="vk-header-settings-anchor" onKeyDown={onKeyDown}>
        <button
          ref={button}
          type="button"
          class="vk-header-action"
          classList={{'is-open': isOpen()}}
          title="Настройки"
          aria-label="Настройки"
          aria-expanded={isOpen()}
          aria-controls="vk-header-settings-panel"
          onClick={() => setOpen((open) => !open)}
        >
          <VKIcon name="settings" size={16} />
        </button>

        <Show when={isMounted()}>
          <div id="vk-header-settings-panel" class="vk-news-settings vk-header-settings-panel" classList={{'is-closing': !isOpen()}} role="group" aria-label="Настройки">
            <div class="vk-news-settings-head">
              <span class="vk-news-settings-title">Настройки</span>
            </div>

            <VKHomeBlocksSettings />
          </div>
        </Show>
      </div>
    </div>
  );
}

/**
 * «Настройки» of the main page on a phone: the gear in the top bar and, under it, the same blocks
 * (`VKHomeBlocksSettings`) in a modal window, as there is no free space in the bar for a panel.
 */
export function VKHeaderSettingsMobile() {
  const [isOpen, setOpen] = createSignal(false);

  return (
    <>
      <button
        type="button"
        class="vk-header-action vk-header-action-icon"
        title="Настройки"
        aria-label="Настройки"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <VKIcon name="settings" size={18} />
      </button>

      <Show when={isOpen()}>
        <VKModal title="Настройки" closeOnBackdrop onClose={() => setOpen(false)}>
          <div class="vk-modal-body">
            <VKHomeBlocksSettings />
          </div>
          <div class="vk-modal-foot">
            <button type="button" class="vk-button" onClick={() => setOpen(false)}>Готово</button>
          </div>
        </VKModal>
      </Show>
    </>
  );
}

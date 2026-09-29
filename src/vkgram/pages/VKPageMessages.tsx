import {createEffect, onCleanup} from 'solid-js';

// On <html>: the few messenger pieces Web K keeps outside `#page-chats`
// (see vk-base.scss) are hidden while it's absent.
const MESSAGES_ACTIVE_CLASS = 'vkgram-messages-active';

/**
 * «Сообщения» — the existing Web K messenger, not a copy of it.
 *
 * `host` holds the one and only `#page-chats` (+ the chat wallpaper). This
 * page stays mounted while other sections are open: the messenger is only
 * hidden and made inert, never re-created or moved, so chats, scroll
 * positions and running media survive a section switch.
 */
export default function VKPageMessages(props: {
  host?: HTMLElement,
  active: boolean
}) {
  createEffect(() => {
    const active = props.active;
    document.documentElement.classList.toggle(MESSAGES_ACTIVE_CLASS, active);

    const host = props.host;
    if(!host) return;
    host.classList.toggle('is-hidden', !active);
    // hidden panels must leave the tab order and the accessibility tree
    host.inert = !active;
  });

  onCleanup(() => {
    document.documentElement.classList.remove(MESSAGES_ACTIVE_CLASS);
  });

  return (
    <>
      {props.host ?? <div class="vk-content-placeholder">Сообщения недоступны</div>}
    </>
  );
}

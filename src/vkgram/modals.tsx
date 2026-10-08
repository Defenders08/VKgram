import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';

/**
 * Opens a VKgram window from plain code (a menu item, an action of a page) where there is no
 * component to hold its `<Show>`. The window is a `VKModal`, which portals itself into `.vkgram`,
 * so the host element below is never attached to the document. `onClose` of the window is the
 * returned `close` too: call it to take the window away from the outside.
 */
export function openVKModal(Component: (props: {onClose: () => void}) => JSX.Element) {
  const host = document.createElement('div');
  const state: {dispose?: () => void, closed: boolean} = {closed: false};

  const close = () => {
    if(state.closed) return;
    state.closed = true;
    state.dispose?.();
  };

  state.dispose = render(() => <Component onClose={close} />, host);
  // closed while it was still being rendered: there was nothing to dispose yet
  if(state.closed) state.dispose();
  return close;
}

/** `err.type` of an MTProto error («BALANCE_TOO_LOW»), or an empty string */
export const apiErrorType = (err: unknown): string => String((err as any)?.type ?? (err as any)?.message ?? '');

import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import rootScope from '@lib/rootScope';
import createListenerSetter from '@helpers/solid/createListenerSetter';

/**
 * Up to which message the other side has read my messages in a private chat
 * (`read_outbox_max_id` of the dialog). An outgoing message with `mid <= value` is read.
 * Taken from Web K's dialog storage, re-read on the dialog events; a slow poll covers the case
 * when the read receipt arrives without one.
 */
export default function createOutboxRead(peerId: Accessor<PeerId>, enabled: Accessor<boolean>): Accessor<number> {
  const [maxId, setMaxId] = createSignal(0);
  const listenerSetter = createListenerSetter();

  let token = 0;
  const refresh = async() => {
    const current = ++token;
    try {
      const dialog = await rootScope.managers.dialogsStorage.getDialogOnly(peerId());
      if(current !== token || !dialog) return;
      setMaxId((value) => Math.max(value, (dialog as any).read_outbox_max_id || 0));
    } catch(err) {
      // not known yet — the next event or the poll asks again
    }
  };

  createEffect(on(() => [peerId(), enabled()] as const, ([, isEnabled]) => {
    setMaxId(0);
    if(isEnabled) void refresh();
  }));

  const onEvent = (data: any) => {
    const id = data?.peerId ?? data?.dialog?.peerId;
    if(enabled() && (id === undefined || id === peerId())) void refresh();
  };
  listenerSetter.add(rootScope)('dialog_unread', onEvent);
  listenerSetter.add(rootScope)('dialog_flush', onEvent);
  listenerSetter.add(rootScope)('dialogs_multiupdate', () => enabled() && void refresh());

  const timer = window.setInterval(() => {
    if(enabled() && document.visibilityState === 'visible') void refresh();
  }, 4000);

  onCleanup(() => {
    token++;
    window.clearInterval(timer);
    listenerSetter.removeAll();
  });

  return maxId;
}

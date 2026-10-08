import {createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import App from '@config/app';
import I18n, {LangPackKey} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {ConnectionStatus} from '@lib/mtproto/connectionStatus';
import createListenerSetter from '@helpers/solid/createListenerSetter';

// Web K waits the same before it shows a status, so a short blink of the network is not shown
const SHOW_DELAY = 400;
const INITIAL_DELAY = 2000;

/**
 * The connection / update status Web K writes into its search field
 * («Waiting for network…», «Reconnecting…», «Updating…»), for the header.
 * Follows the same events and rules as Web K's `ConnectionStatusComponent`;
 * `undefined` while everything is fine, so nothing is shown.
 */
export default function useConnectionStatus() {
  const listenerSetter = createListenerSetter();

  const [connecting, setConnecting] = createSignal(false);
  const [hadConnect, setHadConnect] = createSignal(false);
  const [timedOut, setTimedOut] = createSignal(false);
  const [retryAt, setRetryAt] = createSignal<number>();
  const [updating, setUpdating] = createSignal(false);
  // seconds are counted from here
  const [now, setNow] = createSignal(Date.now());
  const [visible, setVisible] = createSignal(false);

  let disposed = false;

  const refresh = async() => {
    const [baseDcId, statuses] = await Promise.all([
      rootScope.managers.apiManager.getBaseDcId(),
      rootScope.managers.rootScope.getConnectionStatus()
    ]);
    if(disposed) return;

    const status = statuses['NET-' + (baseDcId || App.baseDcId)];
    const online = !!status && status.status === ConnectionStatus.Connected;
    if(online) setHadConnect(true);
    setTimedOut(!!status && status.status === ConnectionStatus.TimedOut);
    setConnecting(!online);
    setRetryAt(status?.retryAt);
  };

  listenerSetter.add(rootScope)('connection_status_change', (): void => {
    void refresh();
  });
  listenerSetter.add(rootScope)('state_synchronizing', () => setUpdating(true));
  listenerSetter.add(rootScope)('state_synchronized', () => setUpdating(false));

  // until the first answer (or this delay) the network is not assumed to be down
  const initialTimer = window.setTimeout((): void => {
    void refresh();
  }, INITIAL_DELAY);
  onCleanup(() => {
    disposed = true;
    clearTimeout(initialTimer);
  });

  const text = createMemo(() => {
    let key: LangPackKey;
    let args: (string | number)[] | undefined;
    if(connecting()) {
      if(timedOut()) {
        key = 'Updating';
      } else if(hadConnect()) {
        const at = retryAt();
        if(at !== undefined) {
          key = 'ConnectionStatus.ReconnectInPlain';
          args = [Math.max(0, Math.round((at - now()) / 1000))];
        } else {
          key = 'ConnectionStatus.Reconnecting';
        }
      } else {
        key = 'ConnectionStatus.Waiting';
      }
    } else if(updating()) {
      key = 'Updating';
    } else {
      return;
    }

    return I18n.format(key, true, args);
  });

  // the «reconnect in N s» counter ticks only while there is a retry time
  createEffect(() => {
    if(retryAt() === undefined) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    onCleanup(() => clearInterval(interval));
  });

  // shown after a short delay, hidden at once
  createEffect(() => {
    if(!(connecting() || updating())) {
      setVisible(false);
      return;
    }

    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY);
    onCleanup(() => clearTimeout(timer));
  });

  return () => visible() ? text() : undefined;
}

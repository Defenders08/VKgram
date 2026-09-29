import {createSignal, onCleanup} from 'solid-js';
import rootScope from '@lib/rootScope';
import createListenerSetter from '@helpers/solid/createListenerSetter';

/**
 * The peer ids of the signed-in user's Telegram contacts — the list Web K's
 * own contacts tab is built from (`contacts.getContacts`, cached in the
 * manager). Asked again only when Web K says a contact was added or removed
 * (`contacts_update`); several updates in one burst collapse into one reload.
 */
export default function useContactPeerIds() {
  const listenerSetter = createListenerSetter();
  const [peerIds, setPeerIds] = createSignal<PeerId[]>();

  let loadToken = 0;
  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  const load = () => {
    const token = ++loadToken;
    rootScope.managers.appUsersManager.getContactsPeerIds(undefined, false, 'none').then((ids) => {
      if(disposed || token !== loadToken) return;
      setPeerIds(ids);
    }, (err) => {
      console.error('VKgram: failed to load contacts', err);
      if(!disposed && token === loadToken) setPeerIds((current) => current ?? []);
    });
  };

  load();

  let reloadTimeout: number;
  listenerSetter.add(rootScope)('contacts_update', () => {
    clearTimeout(reloadTimeout);
    reloadTimeout = window.setTimeout(load, 0);
  });
  onCleanup(() => clearTimeout(reloadTimeout));

  return peerIds;
}

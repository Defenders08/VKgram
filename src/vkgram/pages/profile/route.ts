import {createRoot, createSignal} from 'solid-js';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';

/**
 * Local navigation of «Моя страница» on desktop: my page → the page of
 * another user, inside the same content area. Module-level (like the channel
 * route) so it survives a desktop ↔ mobile switch, which re-mounts the page.
 * The mobile page never reads it: there a profile still opens in Web K.
 *
 * It lives on Web K's one navigation stack: opening a profile pushes an item
 * of the same kind a section change does, so browser Back returns to the
 * previous page. The URL mirrors it as `?vkgram=profile&user=<userId>`.
 *
 * NB: this file must not import `sections.ts` (which imports it) or `webk.ts`
 * (which imports `sections.ts`) — see `openProfile.ts` for the entry point.
 */
const URL_PARAM = 'user';

function getPeerIdFromUrl(): PeerId | undefined {
  const params = new URLSearchParams(location.search);
  if(params.get('vkgram') !== 'profile') return;
  const userId = Number(params.get(URL_PARAM));
  return userId > 0 && Number.isInteger(userId) ? userId.toPeerId(false) : undefined;
}

const [profilePeerId, setProfilePeerId] = createRoot(() => createSignal<PeerId | undefined>(getPeerIdFromUrl()));

export {profilePeerId as vkProfilePeerId};

let historyItem: NavigationItem | undefined;

/** `?user=` value for the current state — `sections.ts` uses it when it writes the section */
export function getVKProfileUrlValue(): string | undefined {
  const peerId = profilePeerId();
  return peerId ? '' + peerId.toUserId() : undefined;
}

function writeUrl() {
  appNavigationController.updateUrl((url) => {
    const value = getVKProfileUrlValue();
    if(value && url.searchParams.get('vkgram') === 'profile') url.searchParams.set(URL_PARAM, value);
    else url.searchParams.delete(URL_PARAM);
  });
}

/** Show the page of another user (the section itself is brought up by `openVKProfile`) */
export function openVKProfilePeer(peerId: PeerId) {
  setProfilePeerId(peerId);
  const item: NavigationItem = {
    type: 'vkgram-section',
    onPop: () => {
      // a page that was already replaced or reset has nothing left to close
      if(historyItem !== item) return;
      historyItem = undefined;
      setProfilePeerId(undefined);
      writeUrl();
    },
    onEscape: () => false
  };
  historyItem = item;
  appNavigationController.pushItem(item);
  writeUrl();
}

/** Back to «Моя страница»: through the history item, so the browser entry goes too */
export function closeVKProfile() {
  if(historyItem) {
    appNavigationController.backByItem(historyItem);
    return;
  }

  // opened from a deep link: there is no entry of ours to pop
  setProfilePeerId(undefined);
  writeUrl();
}

/**
 * Drop the open page at once, without touching the history (the layout does
 * it when «Моя страница» is picked in the menu). Its stack item stays, but it
 * no longer does anything when popped.
 */
export function resetVKProfile() {
  if(!profilePeerId() && !historyItem) return;
  historyItem = undefined;
  setProfilePeerId(undefined);
  writeUrl();
}

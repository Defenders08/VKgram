import {createRoot, createSignal} from 'solid-js';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';

/**
 * Local navigation of «Каналы»: list → one channel, inside the same content
 * area. Module-level (like the settings route) so it survives a desktop ↔
 * mobile switch, which re-mounts the page.
 *
 * It lives on Web K's one navigation stack: opening a channel pushes an item
 * of the same kind a section change does, so browser Back pops it and returns
 * to the list; the «← Каналы» button goes through that very item. The URL
 * mirrors it as `?vkgram=channels&channel=<channelId>`.
 *
 * NB: this file must not import `sections.ts` (which imports it).
 */
const URL_PARAM = 'channel';

function getPeerIdFromUrl(): PeerId | undefined {
  const params = new URLSearchParams(location.search);
  if(params.get('vkgram') !== 'channels') return;
  const channelId = Number(params.get(URL_PARAM));
  return channelId > 0 && Number.isInteger(channelId) ? channelId.toPeerId(true) : undefined;
}

const [channelPeerId, setChannelPeerId] = createRoot(() => createSignal<PeerId | undefined>(getPeerIdFromUrl()));

export {channelPeerId as vkChannelPeerId};

let historyItem: NavigationItem | undefined;

/** `?channel=` value for the current state — `sections.ts` uses it when it writes the section */
export function getVKChannelUrlValue(): string | undefined {
  const peerId = channelPeerId();
  return peerId ? '' + peerId.toChatId() : undefined;
}

function writeUrl() {
  appNavigationController.updateUrl((url) => {
    const value = getVKChannelUrlValue();
    if(value && url.searchParams.get('vkgram') === 'channels') url.searchParams.set(URL_PARAM, value);
    else url.searchParams.delete(URL_PARAM);
  });
}

export function openVKChannel(peerId: PeerId) {
  if(channelPeerId() === peerId) return;

  setChannelPeerId(peerId);
  const item: NavigationItem = {
    type: 'vkgram-section',
    onPop: () => {
      if(historyItem === item) historyItem = undefined;
      setChannelPeerId(undefined);
      writeUrl();
    },
    onEscape: () => false
  };
  historyItem = item;
  appNavigationController.pushItem(item);
  writeUrl();
}

/** Back to the list: through the history item if there is one (it also drops the browser entry) */
export function closeVKChannel() {
  if(historyItem) {
    appNavigationController.backByItem(historyItem);
    return;
  }

  // opened from a deep link: there is no entry of ours to pop
  setChannelPeerId(undefined);
  writeUrl();
}

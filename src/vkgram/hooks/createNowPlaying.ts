import {createSignal, onCleanup} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import appMediaPlaybackController from '@components/appMediaPlaybackController';

type NowPlaying = {doc: MyDocument, paused: boolean} | undefined;

/**
 * One state for everybody: a chat can hold dozens of voice messages, each of them reads
 * «what is playing», so the listeners and the poll are started once, with the first reader,
 * and stopped with the last one — not one interval per message.
 */
const [shared, setShared] = createSignal<NowPlaying>();
let readers = 0;
let stopListening: (() => void) | undefined;

const sync = () => {
  const details = appMediaPlaybackController.getPlayingDetails();
  const doc = details?.doc;
  const paused = details?.media?.paused;
  // the same state is not set again: nothing that reads it is redrawn for nothing
  setShared((prev) => {
    if(!doc) return prev ? undefined : prev;
    if(prev && prev.doc.id === doc.id && prev.paused === paused) return prev;
    return {doc, paused};
  });
};
const onStop = () => setShared(undefined);

function startListening() {
  sync();
  appMediaPlaybackController.addEventListener('play', sync);
  appMediaPlaybackController.addEventListener('pause', sync);
  appMediaPlaybackController.addEventListener('stop', onStop);
  // Web K's events can come before it has the track (it is still loading): read it again shortly
  const interval = window.setInterval(sync, 300);
  return () => {
    window.clearInterval(interval);
    appMediaPlaybackController.removeEventListener('play', sync);
    appMediaPlaybackController.removeEventListener('pause', sync);
    appMediaPlaybackController.removeEventListener('stop', onStop);
  };
}

/**
 * What Web K's global audio player is playing right now (`undefined` when it
 * is stopped) and whether it is paused. The player itself stays Web K's:
 * `appMediaPlaybackController.toggle()` plays / pauses it.
 */
export default function createNowPlaying() {
  if(!readers++) stopListening = startListening();
  else sync();

  onCleanup(() => {
    if(--readers) return;
    stopListening?.();
    stopListening = undefined;
  });

  return shared;
}

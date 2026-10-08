import {Accessor, createEffect, createSignal, onCleanup} from 'solid-js';
import appMediaPlaybackController from '@components/appMediaPlaybackController';

/**
 * Current position (seconds) of the track Web K's global player is playing. `playing` is the
 * accessor of `createNowPlaying()`: it changes on every play / pause / track switch, and while a
 * track is actually playing the position is re-read twice a second.
 */
export default function createPlaybackTime(playing: Accessor<{paused: boolean} | undefined>) {
  const [time, setTime] = createSignal(0);
  const read = () => setTime(appMediaPlaybackController.getPlayingDetails()?.media?.currentTime ?? 0);

  createEffect(() => {
    const state = playing();
    read();
    if(!state || state.paused) return;

    const interval = window.setInterval(read, 500);
    onCleanup(() => window.clearInterval(interval));
  });

  return time;
}

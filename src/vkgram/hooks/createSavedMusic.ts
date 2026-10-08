import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import rootScope from '@lib/rootScope';
import type {MyDocument} from '@appManagers/appDocsManager';

/**
 * The tracks of a user's profile music (Telegram «saved music») — the same
 * list Web K's «Все треки» tab opens. The first `limit` tracks and the total.
 *
 * NB: this is the one place that asks for the list: Web K's own
 * `appSavedMusicManager.getSavedMusic`, which also stores the documents with the
 * `savedMusic` reference context — a stale file reference of a track is refreshed
 * by that manager, so the track still plays. The rest of VKgram only reads
 * `tracks()` / `count()`.
 *
 * `refreshKey` — anything that changes when the profile music changes (e.g.
 * the id of `userFull.saved_music`): the list is asked again.
 */
export default function createSavedMusic(options: {
  peerId: Accessor<PeerId>,
  limit: number,
  refreshKey?: Accessor<unknown>
}) {
  const [tracks, setTracks] = createSignal<MyDocument[]>();
  const [count, setCount] = createSignal<number>();

  let generation = 0;
  onCleanup(() => {
    generation++;
  });

  createEffect(on(() => [options.peerId(), options.refreshKey?.()] as const, async([peerId]) => {
    const current = ++generation;
    setTracks(undefined);
    setCount(undefined);
    if(!peerId) return;

    try {
      const page = await rootScope.managers.appSavedMusicManager.getSavedMusic(peerId.toUserId(), 0, options.limit);
      if(current !== generation) return;

      setTracks(page.documents as MyDocument[]);
      setCount(page.count);
    } catch(err) {
      if(current !== generation) return;
      // the block is simply not drawn
      console.error('VKgram: failed to load saved music', err);
      setTracks([]);
    }
  }));

  return {tracks, count};
}

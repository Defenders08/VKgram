import {Accessor, createEffect, createSignal, onCleanup} from 'solid-js';
import rootScope from '@lib/rootScope';
import type {Dialog} from '@appManagers/appMessagesManager';

/**
 * The dialog's own notification settings, when they say anything: a mute date in the future is
 * «muted», a set date in the past (or 0) is «explicitly not muted» — and that overrides the
 * default of the chat type, as it does in Telegram. `undefined`: the dialog has no word on it.
 */
export function getOwnMuteState(dialog: Dialog | undefined): boolean | undefined {
  const until = (dialog as any)?.notify_settings?.mute_until as number | undefined;
  if(typeof until !== 'number') return undefined;
  return until > Math.floor(Date.now() / 1000);
}

/**
 * Which of the peers are muted — Web K's own answer (the peer's settings,
 * then the defaults of its type: `isPeerLocalMuted` with `respectType`), the
 * same one the «Каналы» list marks with 🔕. It is asked again for a peer only
 * when `version(peerId)` changes (the notification settings of that peer changed).
 *
 * The answer comes asynchronously: `isMuted` is `undefined` until it is known,
 * `isResolved` says it is known for all the peers.
 */
export default function createMutedPeers(options: {
  peerIds: Accessor<PeerId[]>,
  version: (peerId: PeerId) => number,
  // the dialog of a peer, if it is at hand: its own settings are asked before the type defaults
  getDialog?: (peerId: PeerId) => Dialog | undefined
}) {
  const [muted, setMuted] = createSignal(new Map<PeerId, boolean>(), {equals: false});
  // the version each peer was last asked at
  const asked = new Map<PeerId, number>();

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });

  const save = (peerId: PeerId, version: number, value: boolean) => {
    if(disposed || asked.get(peerId) !== version) return;
    setMuted((map) => {
      map.set(peerId, value);
      return map;
    });
  };

  createEffect(() => {
    for(const peerId of options.peerIds()) {
      const version = options.version(peerId);
      if(asked.get(peerId) === version) continue;

      asked.set(peerId, version);

      // after a settings change the dialog at hand may be older than the change: ask Web K then
      const own = version === 0 ? getOwnMuteState(options.getDialog?.(peerId)) : undefined;
      if(own !== undefined) {
        save(peerId, version, own);
        continue;
      }

      rootScope.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: true}).then((value) => {
        save(peerId, version, !!value);
      }, (err) => {
        // not muted as far as anyone knows — the peer stays in
        console.error('VKgram: failed to read the mute state', err);
        save(peerId, version, false);
      });
    }
  });

  return {
    isMuted: (peerId: PeerId) => muted().get(peerId),
    isResolved: () => {
      const known = muted();
      return options.peerIds().every((peerId) => known.has(peerId));
    }
  };
}

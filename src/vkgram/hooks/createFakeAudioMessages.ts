import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import type {Message} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import createFakeAudioMessage from '@components/wrappers/fakeAudioMessage';

/**
 * Tracks that live outside any chat history (the profile music) as the local messages Web K
 * itself renders them from — `createFakeAudioMessage`, the adapter of its playlist tab. The
 * audio row (`DocumentTsx` → `wrapDocument` → `AudioElement`) needs a whole message, with
 * `pFlags`, a peer and a unique `mid`; playback identifies a track by `peerId` + `mid`.
 *
 * A track keeps its message (and its negative `mid`) for as long as the hook lives, so the rows
 * of a list are not drawn anew when the list is filtered or grows.
 */
export default function createFakeAudioMessages(options: {
  docs: Accessor<MyDocument[] | undefined>,
  peerId: PeerId
}) {
  const [messages, setMessages] = createSignal<Message.message[]>([]);

  const cache = new Map<DocId, Promise<Message.message>>();
  let fakeMid = 0;
  const getMessage = (doc: MyDocument) => {
    let message = cache.get(doc.id);
    if(!message) {
      message = createFakeAudioMessage({doc, peerId: options.peerId, mid: --fakeMid, savedMusic: true});
      cache.set(doc.id, message);
    }
    return message;
  };

  let generation = 0;
  onCleanup(() => {
    generation++;
  });

  createEffect(on(options.docs, async(docs) => {
    const current = ++generation;
    const result = await Promise.all((docs ?? []).map(getMessage));
    if(current === generation) setMessages(result);
  }));

  return messages;
}

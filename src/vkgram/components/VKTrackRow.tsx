import {Show, createResource} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import {formatDuration} from '@/vkgram/utils/audio';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import VKPlayGlyph from '@/vkgram/components/VKPlayGlyph';
import rootScope from '@lib/rootScope';
import {usePeer} from '@stores/peers';

/** One track of a list drawn from a document: [round play] «performer — title» ..... 3:42 */
export default function VKTrackRow(props: {
  doc: MyDocument,
  isCurrent: boolean,
  isPaused: boolean,
  onPlay: () => void
}) {
  const titles = () => getAudioTitles(props.doc);
  const isPlaying = () => props.isCurrent && !props.isPaused;

  const [sourcePeerId] = createResource(async() => {
    const doc = props.doc;
    if(!doc?.file_reference) return undefined;
    try {
      const result = await rootScope.managers.referencesStorage.getContexts(doc.file_reference);
      const contexts = result[0] as Set<{type: string, peerId?: PeerId}> | undefined;
      if(contexts) {
        for(const ctx of contexts) {
          if(ctx?.type === 'message' && ctx.peerId) {
            return ctx.peerId;
          }
        }
      }
    } catch(e) {
      // ignore
    }
    return undefined;
  });

  const sourcePeer = () => sourcePeerId() ? usePeer(sourcePeerId()) : undefined;
  const sourceTitle = () => {
    const peer = sourcePeer();
    if(!peer) return undefined;
    const p = peer as any;
    return p.title ?? [p.first_name, p.last_name].filter(Boolean).join(' ');
  };

  return (
    <li>
      <button
        type="button"
        class="vk-audio-row"
        classList={{'is-current': props.isCurrent}}
        onClick={() => props.onPlay()}
      >
        <span class="vk-audio-play" aria-hidden="true">
          <VKPlayGlyph playing={isPlaying()} size={14} />
        </span>

        <span class="vk-audio-info">
          <div class="vk-audio-line">
            <Show when={titles()?.performer}>
              <span class="vk-audio-performer">{titles()?.performer}</span>
              <span class="vk-audio-dash" aria-hidden="true">{' — '}</span>
            </Show>
            <span class="vk-audio-title">{titles()?.title || 'Аудио'}</span>
          </div>
          <Show when={sourcePeerId()}>
            <div class="vk-audio-meta">
              <button type="button" class="vk-audio-link" onClick={() => openVKChat(sourcePeerId() as PeerId)} aria-label="Перейти к сообщению">
                Перейти к сообщению
              </button>
            </div>
          </Show>
        </span>

        <Show when={isPlaying()}>
          <span class="vk-audio-eq" aria-hidden="true"><i /><i /><i /></span>
        </Show>

        <span class="vk-audio-duration">{formatDuration(props.doc.duration, true)}</span>
      </button>
    </li>
  );
}

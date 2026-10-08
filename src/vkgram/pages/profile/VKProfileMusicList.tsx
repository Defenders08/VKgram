import {Show, createSignal, For, createMemo} from 'solid-js';
import VKModal from '@/vkgram/components/VKModal';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import type {MyDocument} from '@appManagers/appDocsManager';
import {openWebKSavedMusic} from '@/vkgram/webk';
import createSavedMusic from '@/vkgram/hooks/createSavedMusic';
import createNowPlaying from '@/vkgram/hooks/createNowPlaying';
import VKTrackRow from '@/vkgram/components/VKTrackRow';

const LIMIT = 4;

/**
 * «Музыка» in the narrow column of a profile — the profile's tracks (what
 * «Все треки» used to open). The first few are listed; a click on a track or
 * on «Показать все» opens Web K's own playlist tab of that user, where the
 * playback is. Not drawn when the user has no music.
 */
export default function VKProfileMusicList(props: {
  peerId: PeerId,
  // the first track of the profile music (`userFull.saved_music`): shown alone if the list can't be read
  profileTrack?: MyDocument
}) {
  const music = createSavedMusic({
    peerId: () => props.peerId,
    limit: LIMIT,
    refreshKey: () => props.profileTrack?.id
  });

  const tracks = createMemo(() => {
    const list = music.tracks();
    if(!list) return;
    return list.length || !props.profileTrack ? list : [props.profileTrack];
  });
  // Web K may answer with more tracks than asked for (it keeps what it has loaded): only the first few are listed
  const shown = createMemo(() => tracks()?.slice(0, LIMIT) ?? []);
  const total = () => music.count() ?? tracks()?.length ?? 0;
  const open = () => setModalOpen(true);
  const playing = createNowPlaying();
  const [modalOpen, setModalOpen] = createSignal(false);
  const allMusic = createSavedMusic({
    peerId: () => props.peerId,
    limit: 100,
    refreshKey: () => props.profileTrack?.id
  });

  return (
    <Show when={tracks()?.length}>
      <section class="vk-block vk-profile-music-list" aria-labelledby="vk-profile-music-list-title">
        <h2 id="vk-profile-music-list-title" class="vk-block-title">
          Музыка
          <span class="vk-page-text-secondary vk-list-count"> {total()}</span>
        </h2>

        <ul class="vk-audio-list">
          <For each={shown()}>
            {(doc) => (
              <VKTrackRow
                doc={doc}
                isCurrent={playing()?.doc?.id === doc.id}
                isPaused={!!playing()?.paused}
                onPlay={() => playing()?.doc?.id === doc.id ? appMediaPlaybackController.toggle() : open()}
              />
            )}
          </For>
        </ul>

        <Show when={total() > shown().length}>
          <button type="button" class="vk-link-button vk-mini-more" onClick={open}>
            Показать все
          </button>
        </Show>
      </section>
      <Show when={modalOpen()}>
        <VKModal title="Музыка" onClose={() => setModalOpen(false)}>
          <div class="vk-modal-body">
            <Show when={allMusic.tracks()?.length}>
              <ul class="vk-audio-list">
                <For each={allMusic.tracks()}>
                  {(doc) => (
                    <VKTrackRow
                      doc={doc}
                      isCurrent={playing()?.doc?.id === doc.id}
                      isPaused={!!playing()?.paused}
                      onPlay={() => playing()?.doc?.id === doc.id ? appMediaPlaybackController.toggle() : () => {}}
                    />
                  )}
                </For>
              </ul>
            </Show>
          </div>
        </VKModal>
      </Show>
    </Show>
  );
}

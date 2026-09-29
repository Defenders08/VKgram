import {createMemo, createSignal, onCleanup, Show} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import {openWebKSavedMusic} from '@/vkgram/webk';

const formatTitles = (doc: MyDocument) => {
  const titles = getAudioTitles(doc);
  if(!titles) return doc?.type === 'voice' ? 'Голосовое сообщение' : 'Аудио';
  return [titles.performer, titles.title].filter(Boolean).join(' — ');
};

/**
 * «Музыкальный статус». Telegram has no "now playing" status for profiles;
 * what exists is the profile music (the first track of the user's saved
 * music, `userFull.saved_music`) and Web K's global audio player — both are
 * shown here, nothing is invented.
 */
export default function VKProfileMusic(props: {profileTrack?: MyDocument}) {
  // the global player: appMediaPlaybackController's play / pause / stop
  const [playing, setPlaying] = createSignal<{doc: MyDocument, paused: boolean}>();
  const sync = () => {
    const details = appMediaPlaybackController.getPlayingDetails();
    setPlaying(details?.doc ? {doc: details.doc, paused: details.media.paused} : undefined);
  };
  sync();
  const onStop = () => setPlaying(undefined);
  appMediaPlaybackController.addEventListener('play', sync);
  appMediaPlaybackController.addEventListener('pause', sync);
  appMediaPlaybackController.addEventListener('stop', onStop);
  onCleanup(() => {
    appMediaPlaybackController.removeEventListener('play', sync);
    appMediaPlaybackController.removeEventListener('pause', sync);
    appMediaPlaybackController.removeEventListener('stop', onStop);
  });

  const profileTrack = createMemo(() => props.profileTrack && formatTitles(props.profileTrack));

  return (
    <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-music-title">
      <h2 id="vk-profile-music-title" class="vk-block-title">Музыкальный статус</h2>

      <dl class="vk-profile-info-list">
        <div class="vk-profile-info-row">
          <dt>Сейчас играет</dt>
          <dd>
            <Show when={playing()} fallback={<span class="vk-page-text-secondary">Сейчас ничего не играет.</span>}>
              {formatTitles(playing().doc)}
              {' '}
              <button
                type="button"
                class="vk-link-button"
                aria-label={playing().paused ? 'Продолжить' : 'Пауза'}
                onClick={() => appMediaPlaybackController.toggle()}
              >
                {playing().paused ? '▶' : '⏸'}
              </button>
            </Show>
          </dd>
        </div>

        <div class="vk-profile-info-row">
          <dt>Музыка в профиле</dt>
          <dd>
            <Show when={profileTrack()} fallback={<span class="vk-page-text-secondary">Не добавлена.</span>}>
              {profileTrack()}
              {' · '}
              <button type="button" class="vk-link-button" onClick={() => openWebKSavedMusic()}>
                Все треки
              </button>
            </Show>
          </dd>
        </div>
      </dl>
    </section>
  );
}

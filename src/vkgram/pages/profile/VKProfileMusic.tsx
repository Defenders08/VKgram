import {createMemo, Show} from 'solid-js';
import type {MyDocument} from '@appManagers/appDocsManager';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import {openWebKSavedMusic} from '@/vkgram/webk';
import createNowPlaying from '@/vkgram/hooks/createNowPlaying';
import {formatAudioTitles} from '@/vkgram/utils/audio';

/**
 * «Музыкальный статус». Telegram has no "now playing" status for profiles;
 * what exists is the profile music (the first track of the user's saved
 * music, `userFull.saved_music`) and Web K's global audio player — both are
 * shown here, nothing is invented.
 */
export default function VKProfileMusic(props: {
  profileTrack?: MyDocument,
  // desktop: the tracks are their own block «Музыка» (VKProfileMusicList), no link here
  hideAllTracks?: boolean,
  // the id of the block in the page's blocks («Настройки» of the top bar)
  blockId?: string
}) {
  // the global player: appMediaPlaybackController's play / pause / stop
  const playing = createNowPlaying();

  const profileTrack = createMemo(() => props.profileTrack && formatAudioTitles(props.profileTrack));

  return (
    <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-music-title" data-vk-home-block={props.blockId}>
      <h2 id="vk-profile-music-title" class="vk-block-title">Музыкальный статус</h2>

      <dl class="vk-profile-info-list">
        <div class="vk-profile-info-row">
          <dt>Сейчас играет</dt>
          <dd>
            <Show when={playing()} fallback={<span class="vk-page-text-secondary">Сейчас ничего не играет.</span>}>
              {formatAudioTitles(playing().doc)}
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
              <Show when={!props.hideAllTracks}>
                {' · '}
                <button type="button" class="vk-link-button" onClick={() => openWebKSavedMusic()}>
                  Все треки
                </button>
              </Show>
            </Show>
          </dd>
        </div>
      </dl>
    </section>
  );
}

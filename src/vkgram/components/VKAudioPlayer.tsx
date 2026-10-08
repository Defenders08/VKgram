import {Show, createSignal} from 'solid-js';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import createNowPlaying from '@/vkgram/hooks/createNowPlaying';
import createPlaybackTime from '@/vkgram/hooks/createPlaybackTime';
import {formatAudioTitles, formatDuration, formatTime} from '@/vkgram/utils/audio';
import VKPlayGlyph from '@/vkgram/components/VKPlayGlyph';

/**
 * The player block of «Аудиозаписи». The top row: previous / play-pause / next (the project's
 * square buttons), «исполнитель — название», shuffle and repeat. Under it the position slider with
 * both times; a click or a drag on it (← / → on it) moves the position. It has no player of its
 * own: it only drives Web K's global one (`appMediaPlaybackController`), the same one the rows of
 * every tab start.
 */
export default function VKAudioPlayer() {
  const playing = createNowPlaying();
  const time = createPlaybackTime(playing);

  const [repeatState, setRepeatState] = createSignal(0); // 0=off, 1=all, 2=one
  const [shuffle, setShuffle] = createSignal(appMediaPlaybackController.shuffle);

  const doc = () => playing()?.doc;
  const titles = () => getAudioTitles(doc());
  const duration = () => appMediaPlaybackController.getPlayingDetails()?.media?.duration || doc()?.duration || 0;
  const progress = () => duration() ? Math.min(1, time() / duration()) : 0;

  const seekFrom = (event: PointerEvent) => {
    const media = appMediaPlaybackController.getPlayingDetails()?.media;
    const total = media?.duration || duration();
    if(!media || !total) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    media.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total;
  };

  const isIdle = () => !doc();
  // `paused` is undefined while nothing plays: that is not «playing»
  const isPlaying = () => !isIdle() && !playing()?.paused;

  const seekBy = (delta: number) => {
    const media = appMediaPlaybackController.getPlayingDetails()?.media;
    const total = media?.duration || duration();
    if(!media || !total) return;
    media.currentTime = Math.max(0, Math.min(total, media.currentTime + delta));
  };

  return (
    <div
      class="vk-audio-block"
      classList={{'is-idle': isIdle(), 'is-playing': isPlaying()}}
      role="group"
      aria-label="Плеер"
    >
      <div class="vk-audio-block-top">
        <div class="vk-audio-block-controls">
          <button
            type="button"
            class="vk-audio-block-step"
            aria-label="Предыдущий трек"
            title="Предыдущий трек"
            onClick={() => appMediaPlaybackController.previous()}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path d="M2.5 2.5h1.8v11H2.5zM13.5 2.8v10.4L5.6 8z" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            class="vk-audio-block-toggle"
            aria-label={isPlaying() ? 'Пауза' : 'Воспроизвести'}
            title={isPlaying() ? 'Пауза' : 'Воспроизвести'}
            onClick={() => appMediaPlaybackController.toggle()}
          >
            <VKPlayGlyph playing={isPlaying()} size={14} />
          </button>
          <button
            type="button"
            class="vk-audio-block-step"
            aria-label="Следующий трек"
            title="Следующий трек"
            onClick={() => appMediaPlaybackController.next()}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <path d="M13.5 2.5h-1.8v11h1.8zM2.5 2.8v10.4L10.4 8z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div class="vk-audio-block-main">
          <div class="vk-audio-block-line" title={isIdle() ? undefined : formatAudioTitles(doc())}>
            <Show
              when={!isIdle()}
              fallback={<span class="vk-audio-block-placeholder">Выберите аудиозапись из списка</span>}
            >
              <Show when={titles()?.performer}>
                <span class="vk-audio-block-performer">{titles().performer}</span>
                <span class="vk-audio-block-dash" aria-hidden="true">{' — '}</span>
              </Show>
              <span class="vk-audio-block-title">{titles()?.title || formatAudioTitles(doc())}</span>
            </Show>
          </div>
        </div>

        <div class="vk-audio-block-extras">
          <button
            type="button"
            class="vk-audio-block-btn"
            classList={{'is-active': shuffle()}}
            aria-label="Случайный порядок"
            aria-pressed={shuffle()}
            title="Случайный порядок"
            onClick={() => {
              const next = !shuffle();
              setShuffle(next);
              appMediaPlaybackController.shuffle = next;
            }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 3 21 3 21 8" />
              <line x1="4" y1="20" x2="21" y2="3" />
              <polyline points="21 16 21 21 16 21" />
              <line x1="15" y1="15" x2="21" y2="21" />
              <line x1="4" y1="4" x2="9" y2="9" />
            </svg>
          </button>

          <button
            type="button"
            class="vk-audio-block-btn"
            classList={{
              'is-active': repeatState() === 1,
              'is-active-one': repeatState() === 2
            }}
            aria-label="Повтор"
            aria-pressed={repeatState() > 0}
            title="Повтор"
            onClick={() => {
              const next = (repeatState() + 1) % 3;
              setRepeatState(next);
              appMediaPlaybackController.loop = next > 0;
            }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
              <Show when={repeatState() === 2}>
                <text x="12" y="15" font-size="8" font-weight="bold" text-anchor="middle" fill="currentColor" stroke="none">1</text>
              </Show>
            </svg>
          </button>
        </div>
      </div>

      <div class="vk-audio-block-position">
        <span class="vk-audio-block-time">{formatTime(time())}</span>
        <div
          class="vk-audio-block-seek"
          role="slider"
          tabindex={isIdle() ? -1 : 0}
          aria-label="Позиция"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration())}
          aria-valuenow={Math.round(time())}
          style={{'--vk-audio-progress': progress() * 100 + '%'}}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seekFrom(event);
          }}
          onPointerMove={(event) => {
            if(event.buttons & 1) seekFrom(event);
          }}
          onKeyDown={(event) => {
            if(event.key === 'ArrowRight') {
              event.preventDefault();
              seekBy(5);
            } else if(event.key === 'ArrowLeft') {
              event.preventDefault();
              seekBy(-5);
            }
          }}
        >
          <span class="vk-audio-block-fill" style={{width: progress() * 100 + '%'}} />
        </div>
        <span class="vk-audio-block-time">{duration() ? formatDuration(duration(), true) : '00:00'}</span>
      </div>
    </div>
  );
}

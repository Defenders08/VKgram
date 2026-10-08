import {createEffect, createMemo, createSignal, For, on, onCleanup, Show} from 'solid-js';
import type {Message} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import DocumentTsx from '@components/wrappers/documentTsx';
import createNowPlaying from '@/vkgram/hooks/createNowPlaying';
import createPlaybackTime from '@/vkgram/hooks/createPlaybackTime';
import VKPlayGlyph from '@/vkgram/components/VKPlayGlyph';
import {getVoiceBars} from '@/vkgram/utils/waveform';

const BARS = 40;
const SEEK_STEP = 5; // seconds, the arrow keys on the wave

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** `m:ss` — «0:06», «1:24» */
const mss = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
};

/**
 * A voice message of a chat: [round play] [the shape of the voice, filled up to the
 * playing position] [time]. It is drawn here, from the document (the bars are its recorded
 * waveform); the playback is not — Web K's own audio element stays in the message, invisible,
 * and the button presses its toggle, exactly as the rows of «Аудиозаписи» do (`VKAudioItem`).
 * So the download, the playlist (the next voice message after this one) and the global player
 * are Web K's. A click on the wave rewinds the message that is playing.
 */
export default function VKVoiceMessage(props: {message: Message.message}) {
  let native!: HTMLDivElement;
  let wave!: HTMLDivElement;

  const playing = createNowPlaying();

  const doc = () => getMediaFromMessage(props.message, true) as MyDocument;
  const duration = () => doc()?.duration ?? 0;
  const bars = createMemo(() => getVoiceBars(doc(), BARS));

  const isCurrent = () => !!doc() && playing()?.doc?.id === doc().id;
  const isPlaying = () => isCurrent() && !playing()!.paused;

  // only the message that sounds reads the position of the player
  const time = createPlaybackTime(() => isCurrent() ? playing() : undefined);
  // the position of the player; set by a rewind too, so a paused message shows where it was rewound to
  const [position, setPosition] = createSignal(0);
  createEffect(on(time, (seconds) => setPosition(seconds)));
  createEffect(on(isCurrent, (current) => {
    if(!current) setPosition(0);
  }));

  const progress = () => isCurrent() && duration() ? clamp01(position() / duration()) : 0;

  // From the press to the first sound Web K loads the voice message: the button already answers.
  const [pending, setPending] = createSignal(false);
  let startedFrom: string | undefined;
  let pendingTimer: number | undefined;
  const stopPending = () => {
    window.clearTimeout(pendingTimer);
    setPending(false);
  };
  onCleanup(() => window.clearTimeout(pendingTimer));
  createEffect(() => {
    if(!pending()) return;
    const id = playing()?.doc?.id as string | undefined;
    // it sounds — or Web K went on to another track: the wait is over
    if(isPlaying() || (id !== undefined && id !== startedFrom && !isCurrent())) stopPending();
  });
  const isLoading = () => pending() && !isPlaying();

  const toggle = () => {
    if(isCurrent()) {
      appMediaPlaybackController.toggle();
      return;
    }
    // it is loading already: a second press would only stop it
    if(pending()) return;

    const button = native.querySelector<HTMLElement>('.audio-toggle') ?? native.querySelector<HTMLElement>('.audio');
    if(!button) {
      const audio = native.querySelector<HTMLAudioElement>('audio');
      if(audio?.paused) void audio.play().catch(() => {});
      return;
    }

    startedFrom = playing()?.doc?.id as string | undefined;
    setPending(true);
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(stopPending, 10000);
    button.click();
  };

  const seekTo = (seconds: number) => {
    const media = appMediaPlaybackController.getPlayingDetails()?.media;
    if(!media || !isCurrent()) return;
    const total = isFinite(media.duration) && media.duration > 0 ? media.duration : duration();
    media.currentTime = Math.min(total, Math.max(0, seconds));
    setPosition(media.currentTime);
  };

  const onWaveClick = (event: MouseEvent) => {
    // nothing sounds yet: the wave is one more way to press play
    if(!isCurrent()) {
      toggle();
      return;
    }
    const rect = wave.getBoundingClientRect();
    if(!rect.width) return;
    seekTo(clamp01((event.clientX - rect.left) / rect.width) * duration());
  };

  const onWaveKeyDown = (event: KeyboardEvent) => {
    if(event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      if(!isCurrent()) return;
      event.preventDefault();
      seekTo(position() + (event.key === 'ArrowRight' ? SEEK_STEP : -SEEK_STEP));
    } else if(event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  };

  const Bars = () => (
    <For each={bars()}>
      {(height) => <i style={`--h:${height.toFixed(3)}`} />}
    </For>
  );

  return (
    <div
      class="vk-voice"
      classList={{'is-current': isCurrent() || pending(), 'is-playing': isPlaying(), 'is-loading': isLoading()}}
    >
      <button
        type="button"
        class="vk-audio-play vk-voice-play"
        aria-label={isLoading() ? 'Загрузка' : isPlaying() ? 'Пауза' : 'Воспроизвести голосовое сообщение'}
        aria-busy={isLoading()}
        onClick={toggle}
      >
        <Show when={!isLoading()} fallback={<span class="vk-audio-spinner" aria-hidden="true" />}>
          <VKPlayGlyph playing={isPlaying()} size={14} />
        </Show>
      </button>

      <div
        ref={wave}
        class="vk-voice-wave"
        role="slider"
        tabindex="0"
        aria-label="Позиция в голосовом сообщении"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration())}
        aria-valuenow={Math.round(isCurrent() ? position() : 0)}
        aria-valuetext={`${mss(isCurrent() ? position() : 0)} из ${mss(duration())}`}
        onClick={onWaveClick}
        onKeyDown={onWaveKeyDown}
      >
        <div class="vk-voice-bars" aria-hidden="true"><Bars /></div>
        {/* the same bars in the accent colour, uncovered up to the playing position */}
        <div class="vk-voice-bars vk-voice-bars-played" style={`clip-path:inset(0 ${((1 - progress()) * 100).toFixed(2)}% 0 0)`} aria-hidden="true"><Bars /></div>
      </div>

      <span class="vk-voice-time">{mss(isCurrent() ? position() : duration())}</span>

      <div ref={native} class="vk-voice-native" aria-hidden="true">
        <DocumentTsx
          class="vk-message-document"
          message={props.message}
          searchContext={{
            peerId: props.message.peerId,
            inputFilter: {_: 'inputMessagesFilterRoundVoice'}
          }}
          autoDownloadSize={2e6}
          getSize={() => 320}
        />
      </div>
    </div>
  );
}

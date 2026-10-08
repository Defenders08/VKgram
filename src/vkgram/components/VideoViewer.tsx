import {createSignal, onCleanup, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import styles from './VideoViewer.module.scss';
import VKIcon from '@/vkgram/components/VKIcons';

export interface VideoViewerProps {
  src: string;
  onClose: () => void;
  isRound?: boolean;
}

export default function VideoViewer(props: VideoViewerProps) {
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [current, setCurrent] = createSignal(0);
  const [duration, setDuration] = createSignal(0);
  const [volume, setVolume] = createSignal(1);
  const [muted, setMuted] = createSignal(false);
  const [isFullscreen, setIsFullscreen] = createSignal(false);
  const [showControls, setShowControls] = createSignal(true);
  let videoEl: HTMLVideoElement;
  let timer: number;

  const hideControlsTimer = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => setShowControls(false), 2500);
  };

  const togglePlay = () => {
    if(isPlaying()) {
      videoEl.pause();
      setIsPlaying(false);
    } else {
      videoEl.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const seek = (percent: number) => {
    if(duration() > 0) {
      videoEl.currentTime = duration() * percent;
      setCurrent(videoEl.currentTime);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  onCleanup(() => {
    clearTimeout(timer);
    if(videoEl) videoEl.pause();
  });

  return (
    <div
      class={classNames(styles['vk-video-viewer'], props.isRound && styles['vk-video-viewer-round'])}
      onClick={(e) => {
        if((e.target as HTMLElement).closest('.vk-video-controls')) return;
        togglePlay();
        setShowControls(true);
        hideControlsTimer();
      }}
      onMouseMove={() => { setShowControls(true); hideControlsTimer(); }}
    >
      <div class="vk-video-backdrop" onClick={props.onClose} />
      <div class="vk-video-container" classList={{'vk-video-container-fullscreen': isFullscreen()}}>
        <video
          ref={(el) => {
            videoEl = el;
            el.src = props.src;
            el.muted = muted();
            el.loop = props.isRound ?? false;
            el.autoplay = false;
            el.playsInline = true;
            el.onloadedmetadata = () => setDuration(el.duration || 0);
            el.ontimeupdate = () => setCurrent(el.currentTime || 0);
            el.onended = () => { setIsPlaying(false); if(!props.isRound) setCurrent(0); };
          }}
          class="vk-video-element"
        />
        <button
          type="button"
          class="vk-video-close"
          aria-label="Закрыть"
          onClick={props.onClose}
        >
          <VKIcon name="close" size={20} />
        </button>
        <Show when={showControls()}>
          <div class="vk-video-controls">
            <button type="button" class="vk-video-btn" onClick={togglePlay} aria-label={isPlaying() ? 'Пауза' : 'Play'}>
              <VKIcon name={isPlaying() ? 'pause' : 'play'} size={24} />
            </button>
            <div class="vk-video-progress" onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}>
              <div class="vk-video-progress-fill" style={{width: `${duration() > 0 ? (current() / duration() * 100) : 0}%`}} />
            </div>
            <span class="vk-video-time">{formatTime(current())} / {formatTime(duration())}</span>
            <button type="button" class="vk-video-btn" onClick={() => { setMuted((m) => { videoEl.muted = !m; return !m; }); }} aria-label={muted() ? 'Включить звук' : 'Отключить звук'}>
              <VKIcon name={muted() ? 'mute' : 'volume'} size={18} />
            </button>
            <button type="button" class="vk-video-btn" onClick={() => {
              if(isFullscreen()) {
                document.exitFullscreen?.();
                setIsFullscreen(false);
              } else {
                videoEl.parentElement?.requestFullscreen?.();
                setIsFullscreen(true);
              }
            }} aria-label="На весь экран">
              <VKIcon name="fullscreen" size={18} />
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}

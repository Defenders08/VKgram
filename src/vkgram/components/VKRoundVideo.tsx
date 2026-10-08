import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import type {Message} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import {isTempId} from '@appManagers/utils/messages/isTempId';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import VideoTsx from '@components/wrappers/videoTsx';
import {flyFromRect} from '@/vkgram/utils/animate';
import {takeRoundFlySource} from '@/vkgram/utils/roundMessageFly';
import VKPlayGlyph from '@/vkgram/components/VKPlayGlyph';

type RoundState = 'idle' | 'playing' | 'paused';
type Player = {stop: () => void};

// one circle sounds at a time: the next one to start stops this one
let current: Player | undefined;

/** `m:ss` — «0:12» */
const mss = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
};

/**
 * A round video message that plays where it is — as in the official clients, not in a viewer
 * over the page. At rest it is what Web K draws (a muted loop of the clip); a click starts it
 * from the beginning, with the sound, and the accent ring around the circle fills with the
 * time; a click pauses / resumes it, the end brings back the loop. The time under the circle
 * counts down while it plays.
 *
 * The video element is Web K's (`VideoTsx` does the download and the thumbnail): the player
 * only borrows it — its `muted` / `loop` / position are put back as they were when it stops.
 * While Web K has not made the video yet (the clip is still to be downloaded) the click is
 * left to Web K.
 */
export default function VKRoundVideo(props: {message: Message.message, doc: MyDocument}) {
  let wrap!: HTMLDivElement;

  const [state, setState] = createSignal<RoundState>('idle');
  const [elapsed, setElapsed] = createSignal(0);
  const [hasVideo, setHasVideo] = createSignal(false);
  // the clip waits for data (the start, a seek): a spinner instead of the play mark
  const [waiting, setWaiting] = createSignal(false);
  // how far the circle is moved sideways from its place: it plays in the middle of the chat
  const [shift, setShift] = createSignal(0);

  let video: HTMLVideoElement | undefined;
  let before: {muted: boolean, loop: boolean, paused: boolean} | undefined;
  let raf = 0;

  const findVideo = () => wrap?.querySelector<HTMLVideoElement>('video') ?? undefined;
  const length = () => {
    const duration = video?.duration;
    return duration && isFinite(duration) ? duration : (props.doc.duration ?? 0);
  };
  const progress = () => state() === 'idle' || !length() ? 0 : Math.min(1, elapsed() / length());
  const remaining = () => state() === 'idle' ? (props.doc.duration ?? 0) : Math.ceil(Math.max(0, length() - elapsed()));

  /** Moves the circle (a transform: nothing around it reflows) to the horizontal middle of the chat. */
  const lift = () => {
    const box = wrap.closest<HTMLElement>('.vk-custom-chat-history') ?? document.documentElement;
    const bounds = box.getBoundingClientRect();
    const middle = bounds.left + box.clientLeft + box.clientWidth / 2;
    const rect = wrap.getBoundingClientRect(); // already includes the shift it has now
    setShift((value) => value + middle - (rect.left + rect.width / 2));
  };

  const tick = () => {
    if(!video) return;
    setElapsed(video.currentTime);
    raf = requestAnimationFrame(tick);
  };
  const stopTick = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  // paused / resumed from outside (the browser, a call, the global player): the ring follows
  const onPause = () => {
    if(state() !== 'playing' || !video || video.ended) return;
    stopTick();
    setState('paused');
  };
  const onPlay = () => {
    if(state() !== 'paused') return;
    setState('playing');
    tick();
  };
  const onEnded = () => release();
  const onWaiting = () => setWaiting(true);
  const onReady = () => setWaiting(false);

  /** Gives the video back as Web K had it (the muted loop) and returns to rest. */
  const release = () => {
    stopTick();
    if(video) {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('canplay', onReady);
      if(before) {
        video.muted = before.muted;
        video.loop = before.loop;
        video.currentTime = 0;
        if(before.paused) video.pause();
        else void video.play().catch(() => {});
      }
    }
    before = undefined;
    video = undefined;
    setState('idle');
    setWaiting(false);
    setElapsed(0);
    setShift(0);
    if(current === player) current = undefined;
  };
  const player: Player = {stop: release};

  const play = () => {
    const element = findVideo();
    if(!element) return;

    // Web K made another element since (a redraw): what was playing is gone
    if(video && video !== element) release();

    if(state() === 'paused' && video) {
      void video.play().catch(release);
      return;
    }

    if(current && current !== player) current.stop();
    // a voice message / a track that sounds gives way
    const playing = appMediaPlaybackController.getPlayingDetails();
    if(playing?.media && playing.media !== element && !playing.media.paused) appMediaPlaybackController.toggle();

    video = element;
    before = {muted: element.muted, loop: element.loop, paused: element.paused};
    element.addEventListener('ended', onEnded);
    element.addEventListener('pause', onPause);
    element.addEventListener('play', onPlay);
    element.addEventListener('waiting', onWaiting);
    element.addEventListener('playing', onReady);
    element.addEventListener('canplay', onReady);
    element.loop = false;
    element.muted = false;
    element.currentTime = 0;
    current = player;
    setState('playing');
    lift();
    tick();
    void element.play().catch(release);
  };

  const pause = () => {
    if(!video) return;
    stopTick();
    setState('paused');
    video.pause();
  };

  const toggle = () => state() === 'playing' ? pause() : play();

  /** A click on the ring band while it plays / is paused: the position is where the ring was hit (clockwise from the top). */
  const seekByRing = (event: MouseEvent) => {
    if(state() === 'idle' || !video || !length()) return false;
    const rect = wrap.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const radius = rect.width / 2;
    if(Math.hypot(dx, dy) < radius * .84) return false; // inside the band: the click is play / pause
    const turn = (Math.atan2(dx, -dy) / (Math.PI * 2) + 1) % 1;
    video.currentTime = turn * length();
    setElapsed(video.currentTime);
    return true;
  };

  onMount(() => {
    const observer = new MutationObserver(() => setHasVideo(!!findVideo()));
    observer.observe(wrap, {childList: true, subtree: true});
    setHasVideo(!!findVideo());

    // Capture phase: the circle is ours once there is a video to play. Web K's own handlers
    // on it (and anything that would open a viewer) never see the click.
    const onClick = (event: MouseEvent) => {
      if((event.target as Element | null)?.closest('.vk-round-close')) return; // the cross has its own handler
      if(!findVideo()) return;
      event.stopPropagation();
      event.preventDefault();
      if(seekByRing(event)) return;
      toggle();
    };
    // a touch screen: Web K reads a tap from touchstart / touchend; the click that follows is ours
    const swallowTouch = (event: Event) => {
      if(findVideo()) event.stopPropagation();
    };
    // the middle moves with the window while the circle is away from its place
    const onResize = () => {
      if(state() !== 'idle') lift();
    };
    window.addEventListener('resize', onResize);

    wrap.addEventListener('click', onClick, true);
    wrap.addEventListener('touchstart', swallowTouch, true);
    wrap.addEventListener('touchend', swallowTouch, true);

    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
      wrap.removeEventListener('click', onClick, true);
      wrap.removeEventListener('touchstart', swallowTouch, true);
      wrap.removeEventListener('touchend', swallowTouch, true);
    });
  });
  onCleanup(release);

  const label = () => state() === 'playing' ? 'Поставить видеосообщение на паузу' : 'Воспроизвести видеосообщение';

  return (
    <div
      ref={wrap}
      class="vk-round"
      classList={{'is-idle': state() === 'idle', 'is-playing': state() === 'playing', 'is-paused': state() === 'paused', 'is-waiting': waiting() && state() === 'playing', 'has-video': hasVideo(), 'is-lifted': state() !== 'idle'}}
      style={shift() ? `transform:translateX(${shift().toFixed(1)}px) scale(${state() === 'idle' ? 1 : 1.14})` : undefined}
      role="button"
      tabindex="0"
      aria-label={label()}
      aria-pressed={state() === 'playing'}
      onKeyDown={(event) => {
        if(event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        toggle();
      }}
    >
      <VideoTsx
        class="vk-message-video vk-message-video-round"
        doc={props.doc}
        message={props.message}
        boxWidth={200}
        boxHeight={200}
        // a handler is always given (as for every video here), but it is empty: the click is the player's
        onClick={() => {}}
        ref={(el: HTMLDivElement) => {
          // Web K defers the player of its own outgoing round videos to the
          // bubbles code, which fires the deferred `.media-round.onLoad` when
          // the temp message is replaced by the sent one. That code never runs
          // under VKgram's renderer, so fire it here once the message has a
          // real mid (a temp one is still uploading and will remount).
          const round = el.querySelector<HTMLElement>('.media-round[data-is-outgoing]');
          if(round && !isTempId(props.message.mid)) {
            round.dataset.mid = '' + props.message.mid;
            delete round.dataset.isOutgoing;
            (round as any).onLoad?.(true);
          }

          // the just-recorded circle flies from the composer's preview into
          // its place (the source rect is left by the composer on «отправить»)
          if(props.message.pFlags.is_outgoing) {
            const flySource = takeRoundFlySource(props.message.peerId);
            if(flySource) {
              requestAnimationFrame(() => {
                const circle = el.querySelector<HTMLElement>('.media-round');
                if(circle?.isConnected) flyFromRect(circle, flySource);
              });
            }
          }
        }}
      />

      {/* the ring: 100 units of the path are the whole circle, so the offset is the unplayed rest */}
      <svg class="vk-round-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="vk-round-ring-track" cx="50" cy="50" r="49" />
        <circle
          class="vk-round-ring-bar"
          cx="50"
          cy="50"
          r="49"
          transform="rotate(-90 50 50)"
          pathLength="100"
          stroke-dasharray="100"
          stroke-dashoffset={100 - progress() * 100}
        />
      </svg>

      {/* the round accent button, as on the voice messages: play at rest / paused, a spinner while the
          clip waits for data; while it plays the pause shows only under the pointer */}
      <Show when={hasVideo()}>
        <span class="vk-round-btn" aria-hidden="true">
          <Show when={waiting() && state() === 'playing'} fallback={<VKPlayGlyph playing={state() === 'playing'} size={18} />}>
            <span class="vk-round-spinner" />
          </Show>
        </span>
      </Show>

      {/* a cross beside the circle: stops the playback and brings the muted loop back */}
      <Show when={state() !== 'idle'}>
        <button
          type="button"
          class="vk-round-close"
          aria-label="Остановить видеосообщение"
          title="Остановить"
          // a native listener (not Solid's delegated one): the click is not seen by anything above
          on:click={(event) => {
            event.stopPropagation();
            event.preventDefault();
            release();
          }}
        >
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" fill="none" />
          </svg>
        </button>
      </Show>

      <span class="vk-round-badge" aria-hidden="true">
        {mss(remaining())}
      </span>
    </div>
  );
}

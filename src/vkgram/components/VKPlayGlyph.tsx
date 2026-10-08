import {Show} from 'solid-js';

/** The glyph of a round play button (white on the accent blue): a play, or a pause while the track sounds */
export default function VKPlayGlyph(props: {playing: boolean, size: number}) {
  return (
    <svg class="vk-audio-play-icon" viewBox="0 0 16 16" width={props.size} height={props.size} aria-hidden="true">
      <Show
        when={props.playing}
        fallback={<path d="M5.6 2.6v10.8L13.2 8z" fill="currentColor" />}
      >
        <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
      </Show>
    </svg>
  );
}

import {Accessor, createEffect, createSignal, For, onCleanup, Show} from 'solid-js';
import type {Message} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import rootScope from '@lib/rootScope';
import {usePeer, usePeers} from '@stores/peers';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import createNowPlaying from '@/vkgram/hooks/createNowPlaying';
import {formatDuration} from '@/vkgram/utils/audio';
import VKChannelPostMedia from '@/vkgram/pages/channel/VKChannelPostMedia';
import VKPlayGlyph from '@/vkgram/components/VKPlayGlyph';

// a small chat icon at the right end of a row: «<chat> · <date>» is its hint, a click opens the message
function AudioSource(props: {message: Message.message}) {
  const peers = usePeers();
  const title = () => {
    if(props.message.peerId === rootScope.myId) return 'Избранное';
    const peer = peers[props.message.peerId] as {title?: string, first_name?: string, last_name?: string};
    return peer?.title ?? [peer?.first_name, peer?.last_name].filter(Boolean).join(' ');
  };
  const date = () => formatDateAccordingToTodayNew(new Date(props.message.date * 1000));

  return (
    <button
      type="button"
      class="vk-audio-source"
      title={`${title()} · ${date()}\nОткрыть в «Телеграм»`}
      aria-label={`Открыть в «Телеграм»: ${title()}`}
      onClick={() => openVKChat(props.message.peerId)}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4.5 5.5h15v10.5H10l-4.5 3.5V16h-1z" />
      </svg>
    </button>
  );
}

export type VKNowPlaying = {doc: MyDocument, paused: boolean} | undefined;

/**
 * A track / a voice message of a list, in the old VK's audio-row shape: [round play]
 * «performer — title» ..... 3:42, «<chat> · <time>» under it. The row is drawn here, from the
 * document; the playback is not: Web K's own audio element (`VKChannelPostMedia`) stays in the
 * row, invisible, and a click on the row presses its toggle — so the download, the playlist
 * (the next / previous track) and the global player are exactly Web K's. The track that is
 * playing right now is paused / resumed through the global player.
 */
function AudioItem(props: {
  message: Message.message,
  playing: Accessor<VKNowPlaying>
}) {
  let native!: HTMLDivElement;

  const doc = () => getMediaFromMessage(props.message, true) as MyDocument | undefined;
  const isVoice = () => doc()?.type === 'voice';
  const titles = () => {
    const document = doc();
    return document && !isVoice() ? getAudioTitles(document) : undefined;
  };
  const performer = () => titles()?.performer;
  const title = () => isVoice() ? 'Голосовое сообщение' : (titles()?.title || doc()?.file_name || 'Аудио');
  const isCurrent = () => !!doc() && props.playing()?.doc?.id === doc().id;
  const isPlaying = () => isCurrent() && !props.playing().paused;

  // From the click on a track to its first sound Web K loads it: this time the row already
  // answers — a spinner in the button is there.
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
    const id = props.playing()?.doc?.id as string | undefined;
    // it sounds — or Web K went on to another track: the wait is over
    if(isPlaying() || (id !== undefined && id !== startedFrom && !isCurrent())) stopPending();
  });

  const isLoading = () => pending() && !isPlaying();
  const isActive = () => isCurrent() || pending();

  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    // the source opens the chat, the player has its own buttons; the click Web K's toggle gets from us comes back here
    if(target.closest('.vk-audio-source, .vk-audio-player, .vk-audio-native')) return;

    if(isCurrent()) {
      appMediaPlaybackController.toggle();
      return;
    }
    // it is loading already: a second press would only stop it
    if(pending()) return;

    const toggle = native.querySelector<HTMLElement>('.audio-toggle') ?? native.querySelector<HTMLElement>('.audio');
    if(!toggle) {
      // Fallback: try to click the native audio element through DocumentTsx
      const audioEl = native.querySelector<HTMLAudioElement>('audio');
      if(audioEl && audioEl.paused) {
        audioEl.play();
        return;
      }
      return;
    }

    startedFrom = props.playing()?.doc?.id as string | undefined;
    setPending(true);
    window.clearTimeout(pendingTimer);
    pendingTimer = window.setTimeout(stopPending, 10000);
    toggle.click();
  };

  const messageAuthorPeerId = () => props.message.fromId ?? props.message.peerId;
  const messageAuthorPeer = usePeer(messageAuthorPeerId);
  const messageAuthorTitle = () => {
    const peer = messageAuthorPeer();
    if(!peer) return undefined;
    const p = peer as any;
    return p.title ?? [p.first_name, p.last_name].filter(Boolean).join(' ');
  };

  const chatPeerId = () => props.message.peerId;
  const chatPeer = usePeer(chatPeerId);
  const chatTitle = () => {
    const peer = chatPeer();
    if(!peer) return undefined;
    const p = peer as any;
    return p.title ?? [p.first_name, p.last_name].filter(Boolean).join(' ');
  };

  return (
    <li
      class="vk-audio-item"
      classList={{'is-current': isActive(), 'is-loading': isLoading()}}
      onClick={onClick}
    >
      <button
        type="button"
        class="vk-audio-play"
        aria-label={isLoading() ? 'Загрузка' : isPlaying() ? 'Пауза' : 'Воспроизвести'}
        aria-busy={isLoading()}
      >
        <Show when={!isLoading()} fallback={<span class="vk-audio-spinner" aria-hidden="true" />}>
          <VKPlayGlyph playing={isPlaying()} size={14} />
        </Show>
      </button>

      <div class="vk-audio-info">
        <div class="vk-audio-line">
          <Show when={performer()}>
            <span class="vk-audio-performer">{performer()}</span>
            <span class="vk-audio-dash" aria-hidden="true">{' — '}</span>
          </Show>
          <span class="vk-audio-title">{title()}</span>
        </div>
        <Show when={props.message.peerId === rootScope.myId ? true : (chatTitle() || performer())}>
          <div class="vk-audio-meta">
            <Show when={props.message.peerId === rootScope.myId}>
              <span class="vk-audio-link" style="cursor:default">Избранное</span>
            </Show>
            <Show when={props.message.peerId !== rootScope.myId && (messageAuthorTitle() || chatTitle())}>
              <button type="button" class="vk-audio-link" onClick={() => openVKChat(props.message.fromId ?? props.message.peerId)} aria-label={`Открыть автора: ${messageAuthorTitle() ?? chatTitle()}`}>
                {messageAuthorTitle() ?? chatTitle()}
              </button>
            </Show>
            <Show when={chatTitle() && messageAuthorTitle() && chatTitle() !== messageAuthorTitle()}>
              <button type="button" class="vk-audio-link" onClick={() => openVKChat(props.message.peerId)} aria-label={`Открыть чат: ${chatTitle()}`}>
                {chatTitle()}
              </button>
            </Show>

          </div>
        </Show>
      </div>

      <div class="vk-audio-side">
        <Show when={isPlaying()}>
          <span class="vk-audio-eq" aria-hidden="true"><i /><i /><i /></span>
        </Show>
        <span class="vk-audio-duration">{formatDuration(doc()?.duration, true)}</span>
        <Show when={!props.message.pFlags.local}>
          <AudioSource message={props.message} />
        </Show>
      </div>

      <div ref={native} class="vk-audio-native" aria-hidden="true">
        <VKChannelPostMedia message={props.message} />
      </div>
    </li>
  );
}

/**
 * A list of tracks / voice messages in the new audio-row design: «Аудиозаписи» (the tabs of
 * search, saved, voice) and the «Музыка» block of a channel. The state of Web K's global
 * player is read once here and shared by the rows.
 */
export function VKAudioRows(props: {messages: Message.message[]}) {
  const playing = createNowPlaying();

  return (
    <ul class="vk-audio-list">
      <For each={props.messages}>
        {(message) => <AudioItem message={message} playing={playing} />}
      </For>
    </ul>
  );
}

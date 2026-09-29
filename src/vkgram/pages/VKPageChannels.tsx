import {createEffect, createMemo, createResource, createSignal, For, onCleanup, Show} from 'solid-js';
import type {Chat, Message} from '@layer';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import renderDialogSubtitleParts from '@components/wrappers/dialogSubtitle';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import type {Dialog, MyMessage} from '@appManagers/appMessagesManager';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import removeAccents from '@helpers/string/removeAccents';
import {getMiddleware} from '@helpers/middleware';
import {FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import {openVKChannel, vkChannelPeerId} from '@/vkgram/pages/channel/route';
import VKChannelPage from '@/vkgram/pages/channel/VKChannelPage';
import createIncrementalList from '@/vkgram/hooks/createIncrementalList';
import useSubscribedChannels from '@/vkgram/hooks/useSubscribedChannels';
import VKSearchField from '@/vkgram/components/VKSearchField';

const AVATAR_SIZE = 48;

const normalize = (text: string) => removeAccents(text).toLowerCase();

/**
 * «Каналы» — the broadcast channels the user is subscribed to (no groups, no
 * catalog, no global search).
 *
 * The list comes from Web K's dialogs storage in its own order (see
 * useSubscribedChannels); titles / usernames / avatars from the reactive peer
 * store; the last-message preview is rendered by the same helper Web K's chat
 * list uses. Search filters what is already loaded. A click opens the
 * channel's VKgram page (`pages/channel`); the chat itself is one button away there.
 */
export default function VKPageChannels() {
  return (
    <Show when={vkChannelPeerId()} fallback={<VKChannelsList />}>
      {(peerId) => <VKChannelPage peerId={peerId()} />}
    </Show>
  );
}

function VKChannelsList() {
  const peers = usePeers();
  const {channels, isReady, notifyVersion} = useSubscribedChannels();
  const [query, setQuery] = createSignal('');

  const filtered = createMemo(() => {
    const text = normalize(query().trim().replace(/^@/, ''));
    const all = channels();
    if(!text) return all;

    const words = text.split(/\s+/);
    return all.filter((dialog) => {
      const chat = peers[dialog.peerId] as Chat.channel;
      const haystack = normalize([chat?.title, ...getPeerActiveUsernames(chat)].filter(Boolean).join(' '));
      return words.every((word) => haystack.includes(word));
    });
  });

  const list = createIncrementalList({
    total: () => filtered().length,
    resetKey: query
  });
  const visible = createMemo(() => filtered().slice(0, list.count()));

  return (
    <div class="vk-page vk-channels">
      <section class="vk-block vk-page-block" aria-labelledby="vk-channels-title">
        <h1 id="vk-channels-title" class="vk-page-title">
          Каналы
          <Show when={isReady()}>
            <span class="vk-page-text-secondary vk-list-count"> {channels().length}</span>
          </Show>
        </h1>

        <VKSearchField value={query()} placeholder="Поиск каналов" onInput={setQuery} />

        <Show
          when={filtered().length}
          fallback={
            <p class="vk-page-text vk-page-text-secondary vk-list-empty">
              {!isReady() && !channels().length ?
                'Загрузка каналов…' :
                query().trim() ? 'Ничего не найдено.' : 'Вы пока не подписаны ни на один канал.'}
            </p>
          }
        >
          <ul class="vk-peer-list">
            <For each={visible()}>
              {(dialog) => <ChannelRow dialog={dialog} notifyVersion={notifyVersion} />}
            </For>
          </ul>
          <div ref={list.setSentinel} class="vk-list-sentinel" />
        </Show>
      </section>
    </div>
  );
}

// what Web K's chat list shows as a dialog's last message
function getLastMessage(dialog: Dialog): MyMessage {
  let lastMessage = dialog.topMessage as MyMessage;
  if(lastMessage?.mid !== dialog.top_message) {
    const actual = apiManagerProxy.getMessageByPeer(dialog.peerId, dialog.top_message) as MyMessage;
    if(actual && (actual as Message.messageService).action?._ !== 'messageActionChannelJoined') {
      lastMessage = actual;
    }
  }

  return lastMessage;
}

function ChannelRow(props: {
  dialog: Dialog,
  notifyVersion: (peerId: PeerId) => number
}) {
  const peers = usePeers();
  const peerId = () => props.dialog.peerId;
  const chat = () => peers[peerId()] as Chat.channel;
  const username = () => getPeerActiveUsernames(chat())[0];
  const lastMessage = createMemo(() => getLastMessage(props.dialog));

  const isArchived = () => props.dialog.folder_id === FOLDER_ID_ARCHIVE;
  // the pin is a flag of the dialog itself; in the archive it isn't shown
  const isPinned = () => !isArchived() && !!props.dialog.pFlags?.pinned;
  const unreadCount = () => props.dialog.unread_count || 0;
  const isMarkedUnread = () => !!props.dialog.pFlags?.unread_mark;

  // Web K's answer (the channel's own settings, then the type defaults);
  // asked again only when this peer's notification settings change
  const [isMuted] = createResource(
    () => ({peerId: peerId(), version: props.notifyVersion(peerId())}),
    ({peerId}) => rootScope.managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: true})
  );

  let previewEl: HTMLDivElement;
  createEffect(() => {
    const message = lastMessage();
    const id = peerId();

    const middlewareHelper = getMiddleware();
    onCleanup(() => middlewareHelper.destroy());
    const middleware = middlewareHelper.get();

    if(!message) {
      previewEl.replaceChildren();
      return;
    }

    renderDialogSubtitleParts({
      peerId: id,
      isSaved: false,
      lastMessage: message,
      middleware: middleware as any,
      textColor: 'secondary-text-color',
      messageRenderer: wrapMessageForReply,
      peerTitleRenderer: wrapPeerTitle
    }).then((parts) => {
      if(!middleware()) return;
      previewEl.replaceChildren(...parts);
    }, () => {
      // interrupted by a newer message — nothing to do
    });
  });

  const time = () => {
    const message = lastMessage();
    return message ? formatDateAccordingToTodayNew(new Date(message.date * 1000)) : undefined;
  };

  const open = () => openVKChannel(peerId());

  return (
    <li class="vk-peer-row vk-peer-row-clickable" onClick={open}>
      <div class="vk-peer-avatar">
        <AvatarNewTsx peerId={peerId()} size={AVATAR_SIZE} />
      </div>

      <div class="vk-peer-info">
        <div class="vk-peer-title-line">
          <button type="button" class="vk-link-button vk-peer-name">{chat()?.title}</button>
          <Show when={isPinned()}>
            <span class="vk-peer-flag" title="Закреплён">📌</span>
          </Show>
          <Show when={isMuted()}>
            <span class="vk-peer-flag" title="Без звука">🔕</span>
          </Show>
          <Show when={isArchived()}>
            <span class="vk-peer-flag vk-page-text-secondary">в архиве</span>
          </Show>
        </div>
        <Show when={username()}>
          <div class="vk-peer-sub vk-page-text-secondary">@{username()}</div>
        </Show>
        <div class="vk-peer-preview vk-page-text-secondary" ref={previewEl} />
      </div>

      <div class="vk-peer-meta">
        <div class="vk-peer-time vk-page-text-secondary">{time()}</div>
        <Show when={unreadCount() || isMarkedUnread()}>
          <span class="vk-badge" classList={{'vk-badge-muted': !!isMuted()}}>
            {unreadCount() || ''}
          </span>
        </Show>
      </div>
    </li>
  );
}

import {For, Show} from 'solid-js';
import type {Chat, ChatFull} from '@layer';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import VKModal from '@/vkgram/components/VKModal';

/** «1 подписчик», «3 подписчика», «86 подписчиков» */
function subscribersText(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'подписчик' :
    mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'подписчика' : 'подписчиков';
  return `${count} ${word}`;
}

function ChannelPickerRow(props: {
  chatId: ChatId,
  current: boolean,
  onPick: (chatId: ChatId) => void
}) {
  const peers = usePeers();
  const peerId = () => props.chatId.toPeerId(true);
  const chat = () => peers[peerId()] as Chat.channel | undefined;
  const fullPeer = useFullPeer(peerId()) as () => ChatFull.channelFull | undefined;
  const count = () => fullPeer()?.participants_count ?? chat()?.participants_count;

  return (
    <li>
      <button
        type="button"
        class="vk-picker-row"
        classList={{'is-current': props.current}}
        aria-current={props.current ? 'true' : undefined}
        onClick={() => props.onPick(props.chatId)}
      >
        <AvatarNewTsx peerId={peerId()} size={40} />
        <span class="vk-picker-info">
          <span class="vk-picker-title">{chat()?.title}</span>
          <Show when={count() !== undefined}>
            <span class="vk-page-text-secondary">{subscribersText(count())}</span>
          </Show>
        </span>
        <Show when={props.current}>
          <span class="vk-picker-mark vk-page-text-secondary">Текущий</span>
        </Show>
      </button>
    </li>
  );
}

/**
 * «Выбрать канал»: the list of channels to choose one from, in the VKModal.
 * The same job as Web K's user picker it replaces (single choice, no search,
 * the list is given by the caller): a click on a row calls `onSelect` and
 * closes the window, «Отмена», «×» and Escape just close it.
 */
export default function VKChannelPickerModal(props: {
  title?: string,
  channelIds: ChatId[],
  currentId?: ChatId,
  onSelect: (chatId: ChatId) => void,
  onClose: () => void
}) {
  const pick = (chatId: ChatId) => {
    props.onClose();
    props.onSelect(chatId);
  };

  return (
    <VKModal title={props.title ?? 'Выбор канала'} width={400} closeOnBackdrop onClose={props.onClose}>
      <div class="vk-modal-body vk-picker-body">
        <Show
          when={props.channelIds.length}
          fallback={<p class="vk-page-text vk-page-text-secondary">Нет подходящих каналов.</p>}
        >
          <ul class="vk-picker-list">
            <For each={props.channelIds}>
              {(chatId) => <ChannelPickerRow chatId={chatId} current={chatId === props.currentId} onPick={pick} />}
            </For>
          </ul>
        </Show>
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button vk-button-secondary" onClick={props.onClose}>Отмена</button>
      </div>
    </VKModal>
  );
}

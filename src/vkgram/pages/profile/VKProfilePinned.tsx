import {createSignal, For, Show} from 'solid-js';
import type {Chat, User} from '@layer';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import peerTitle from '@/vkgram/utils/peerTitle';
import VKIcon from '@/vkgram/components/VKIcons';
import VKModal from '@/vkgram/components/VKModal';
import VKChatsPickerModal from '@/vkgram/components/VKChatsPickerModal';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {isBroadcastChannel} from '@/vkgram/hooks/useSubscribedChannels';
import {setVKHomePinned, vkHomePinned, VK_HOME_MAX_PINNED} from '@/vkgram/pages/profile/homeSettings';

type AnyPeer = User.user | Exclude<Chat, Chat.chatEmpty>;

// what the pinned thing is, in a word, under its name
const kindOf = (peer: AnyPeer | undefined) => {
  if(!peer) return '';
  if(peer._ === 'user') return peer.pFlags?.bot ? 'Бот' : 'Личный чат';
  return isBroadcastChannel(peer) ? 'Канал' : 'Группа';
};

/**
 * A «Закреплено» block of «Моя страница» (the user adds, moves and removes the blocks in the
 * «Настройки» of the top bar — `VKHeaderSettings`): the chats and channels the user pinned, as a wide block of
 * tiles. A click opens the channel page (a channel) or the dialog in VKgram's «Сообщения»
 * (anything else) — the same ways the narrow blocks «Подписки» and «Группы» open them.
 *
 * The list is local (`pages/profile/homeSettings`, the section «home» of the VKgram config):
 * it is not a Telegram pin and never reaches the account.
 */
export default function VKProfilePinned(props: {id: string}) {
  const peers = usePeers();
  const [isEditing, setEditing] = createSignal(false);
  const titleId = () => `vk-home-pinned-title-${props.id}`;
  const peerIds = () => vkHomePinned(props.id);

  const open = (peerId: PeerId) => {
    if(isBroadcastChannel(peers[peerId])) {
      openVKChannelPage(peerId);
    } else {
      openVKChat(peerId);
    }
  };

  return (
    <section class="vk-block vk-profile-section vk-home-block" data-vk-home-block={props.id} aria-labelledby={titleId()}>
      <div class="vk-home-head">
        <h2 id={titleId()} class="vk-block-title">
          Закреплено
          <Show when={peerIds().length}>
            <span class="vk-page-text-secondary vk-list-count"> {peerIds().length}</span>
          </Show>
        </h2>
        <Show when={peerIds().length}>
          <button type="button" class="vk-link-button vk-home-edit" aria-haspopup="dialog" onClick={() => setEditing(true)}>
            Изменить
          </button>
        </Show>
      </div>

      <Show
        when={peerIds().length}
        fallback={
          <>
            <p class="vk-page-text vk-page-text-secondary">
              Закрепите чаты и каналы, которые нужны под рукой.
            </p>
            <div class="vk-profile-actions">
              <button type="button" class="vk-button" aria-haspopup="dialog" onClick={() => setEditing(true)}>
                Закрепить
              </button>
            </div>
          </>
        }
      >
        <ul class="vk-home-pinned-list">
          <For each={peerIds()}>
            {(peerId) => (
              <li>
                <button type="button" class="vk-home-pinned-item" onClick={() => open(peerId)}>
                  <AvatarNewTsx peerId={peerId} size={40} />
                  <span class="vk-home-pinned-info">
                    <span class="vk-home-pinned-title">{peerTitle(peers[peerId] as AnyPeer) || 'Чат'}</span>
                    <span class="vk-page-text-secondary">{kindOf(peers[peerId] as AnyPeer)}</span>
                  </span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={isEditing()}>
        <VKPinnedModal id={props.id} onClose={() => setEditing(false)} />
      </Show>
    </section>
  );
}

/**
 * «Закреплено»: the chats in their order (arrows move one, «×» takes it off), «Добавить чаты»
 * opens the picker of all the user's dialogs. Nothing is saved before «Сохранить».
 */
function VKPinnedModal(props: {id: string, onClose: () => void}) {
  const peers = usePeers();
  const [peerIds, setPeerIds] = createSignal<PeerId[]>([...vkHomePinned(props.id)]);
  const [isPicking, setPicking] = createSignal(false);

  const move = (index: number, shift: -1 | 1) => {
    setPeerIds((ids) => {
      const target = index + shift;
      if(target < 0 || target >= ids.length) return ids;
      const next = [...ids];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = () => {
    setVKHomePinned(props.id, peerIds());
    props.onClose();
  };

  return (
    <Show
      when={!isPicking()}
      fallback={
        <VKChatsPickerModal
          title="Что закрепить"
          selected={peerIds()}
          onDone={(ids) => {
            // the picker keeps the order of what was already chosen and adds the new ones at the end
            setPeerIds(ids.slice(0, VK_HOME_MAX_PINNED));
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      }
    >
      <VKModal title="Закреплено" width={440} onClose={props.onClose}>
        <div class="vk-modal-body vk-folder-create">
          <section class="vk-folder-section">
            <h3 class="vk-folder-section-title">Чаты и каналы</h3>
            <div class="vk-folder-chats">
              <For each={peerIds()}>
                {(peerId, index) => (
                  <div class="vk-folder-chat">
                    <AvatarNewTsx peerId={peerId} size={32} />
                    <span class="vk-folder-chat-title">{peerTitle(peers[peerId] as AnyPeer) || 'Чат'}</span>
                    <button
                      type="button"
                      class="vk-folder-chat-remove"
                      aria-label="Выше"
                      disabled={index() === 0}
                      onClick={() => move(index(), -1)}
                    >
                      <VKIcon name="up" size={14} />
                    </button>
                    <button
                      type="button"
                      class="vk-folder-chat-remove vk-home-move-down"
                      aria-label="Ниже"
                      disabled={index() === peerIds().length - 1}
                      onClick={() => move(index(), 1)}
                    >
                      <VKIcon name="up" size={14} />
                    </button>
                    <button
                      type="button"
                      class="vk-folder-chat-remove"
                      aria-label="Открепить"
                      onClick={() => setPeerIds((ids) => ids.filter((id) => id !== peerId))}
                    >
                      <VKIcon name="close" size={14} />
                    </button>
                  </div>
                )}
              </For>
            </div>
            <button type="button" class="vk-folder-add" onClick={() => setPicking(true)}>
              <VKIcon name="plus" size={16} />
              Добавить чаты
            </button>
            <p class="vk-folder-note vk-page-text-secondary">
              Список хранится только в VKgram (в настройках приложения), в Telegram эти чаты
              закреплены не будут.
            </p>
          </section>
        </div>
        <div class="vk-modal-foot">
          <button type="button" class="vk-button vk-button-secondary" onClick={props.onClose}>Отмена</button>
          <button type="button" class="vk-button" onClick={save}>Сохранить</button>
        </div>
      </VKModal>
    </Show>
  );
}

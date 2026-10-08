import {createSignal, For, Show} from 'solid-js';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import peerTitle from '@/vkgram/utils/peerTitle';
import VKIcon from '@/vkgram/components/VKIcons';
import VKModal from '@/vkgram/components/VKModal';
import VKChatsPickerModal from '@/vkgram/components/VKChatsPickerModal';
import {
  createVKLocalFolder,
  removeVKLocalFolder,
  updateVKLocalFolder,
  VK_LOCAL_FOLDER_TITLE_MAX,
  type VKLocalFolder
} from '@/vkgram/pages/localFolders/settings';

/**
 * «Новая папка» / «Папка» of the local folders: a name and the chats / channels
 * the folder holds. The folder is local — it is saved into the VKgram config
 * (`pages/localFolders/settings`), not into the Telegram account — and the
 * blocks of «Сообщения», «Друзья», «Каналы» and «Новости» pick it up at once.
 * With `folder` the dialog edits it and can delete it.
 *
 * The form itself is `VKLocalFolderForm`: the body and the foot of the dialog.
 * The combined «Новая папка» window of the mobile tabs (`VKFolderAddModal`)
 * hosts the same form under its «Локальная папка» tab.
 */
export default function VKLocalFolderModal(props: {
  // the folder to edit; none — a new one
  folder?: VKLocalFolder,
  onClose: () => void,
  // after a save: the id of the created / changed folder
  onSaved?: (id: string) => void
}) {
  return (
    <VKModal title={props.folder ? 'Папка' : 'Новая папка'} width={440} onClose={props.onClose}>
      <VKLocalFolderForm folder={props.folder} onClose={props.onClose} onSaved={props.onSaved} />
    </VKModal>
  );
}

export function VKLocalFolderForm(props: {
  // the folder to edit; none — a new one
  folder?: VKLocalFolder,
  onClose: () => void,
  onSaved?: (id: string) => void
}) {
  const peers = usePeers();
  const [title, setTitle] = createSignal(props.folder?.title ?? '');
  const [peerIds, setPeerIds] = createSignal<PeerId[]>(props.folder?.peerIds ?? []);
  const [picking, setPicking] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [error, setError] = createSignal('');

  const save = () => {
    if(!title().trim()) {
      setError('Введите название папки.');
      return;
    }
    if(!peerIds().length) {
      setError('Добавьте хотя бы один чат или канал.');
      return;
    }

    let id = props.folder?.id;
    if(id) {
      updateVKLocalFolder(id, {title: title(), peerIds: peerIds()});
    } else {
      id = createVKLocalFolder(title(), peerIds())?.id;
      if(!id) {
        setError('Не удалось создать папку: слишком много папок.');
        return;
      }
    }

    props.onSaved?.(id);
    props.onClose();
  };

  const remove = () => {
    if(!props.folder) return;
    removeVKLocalFolder(props.folder.id);
    props.onClose();
  };

  return (
    <Show when={!picking()} fallback={
      <VKChatsPickerModal
        title="Чаты и каналы папки"
        selected={peerIds()}
        onDone={(ids: PeerId[]) => {
          setPeerIds(ids);
          setError('');
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    }>
      <div class="vk-modal-body vk-folder-create">
        <div class="vk-folder-name">
          <input
            type="text"
            class="vk-search"
            placeholder="Название папки"
            aria-label="Название папки"
            maxLength={VK_LOCAL_FOLDER_TITLE_MAX}
            value={title()}
            onInput={(e) => {
              setTitle(e.currentTarget.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if(e.key === 'Enter' && !e.isComposing) save();
            }}
          />
        </div>

        <section class="vk-folder-section">
          <h3 class="vk-folder-section-title">Чаты и каналы</h3>
          <div class="vk-folder-chats">
            <For each={peerIds()}>
              {(peerId) => (
                <div class="vk-folder-chat">
                  <AvatarNewTsx peerId={peerId} size={32} />
                  <span class="vk-folder-chat-title">{peerTitle(peers[peerId] as any) || 'Чат'}</span>
                  <button
                    type="button"
                    class="vk-folder-chat-remove"
                    aria-label="Убрать"
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
            Папка появится под вкладками «Сообщений», «Друзей», «Каналов» и «Новостей»: в каждом
            разделе она покажет свои диалоги, друзей или каналы из этого набора. Папка хранится
            только в VKgram (в настройках приложения), в Telegram она не появится.
          </p>
        </section>

        <Show when={error()}>
          <p class="vk-folder-note" role="alert">{error()}</p>
        </Show>
      </div>
      <div class="vk-modal-foot">
        <Show when={props.folder}>
          <Show
            when={confirmDelete()}
            fallback={
              <button type="button" class="vk-button vk-button-secondary" onClick={() => setConfirmDelete(true)}>
                Удалить
              </button>
            }
          >
            <button type="button" class="vk-button vk-button-secondary" onClick={remove}>
              Точно удалить?
            </button>
          </Show>
        </Show>
        <button type="button" class="vk-button vk-button-secondary" onClick={props.onClose}>Отмена</button>
        <button type="button" class="vk-button" onClick={save}>Сохранить</button>
      </div>
    </Show>
  );
}

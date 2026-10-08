import {createSignal, Show} from 'solid-js';
import VKModal from '@/vkgram/components/VKModal';
import {VKFoldersSettingsPanel} from '@/vkgram/components/VKFoldersSettings';
import VKLocalFolderModal from '@/vkgram/components/VKLocalFolderModal';
import {VK_LOCAL_FOLDERS_SETTINGS_NOTE} from '@/vkgram/components/VKLocalFolders';
import {VKMessagesSettingsPanel} from '@/vkgram/pages/messages/VKMessagesSettings';
import {
  moveVKLocalFolder,
  removeVKLocalFolder,
  vkLocalFolders,
  type VKLocalFolder
} from '@/vkgram/pages/localFolders/settings';

/**
 * «Настроить» of «Сообщений» (a phone): the two strip buttons of the desktop —
 * «Настройки диалогов» and «Настроить папки» — merged into one window, as
 * there is no free space for either of them next to the tabs. The sections are
 * the very panels of the desktop (`VKMessagesSettingsPanel`,
 * `VKFoldersSettingsPanel`); the folders here are the local ones — a Telegram
 * folder is made by the «+» of the tabs (`VKFolderAddModal`) and edited in
 * Telegram.
 *
 * The window hosts the folder dialog itself (`VKLocalFolderModal`) — the
 * mobile layout has no «Локальные папки» block of its own to do it. A folder
 * created or changed here is picked at once (`onSelectFolder`), so its result
 * is seen in the list behind the window.
 */
export default function VKMessagesCustomizeModal(props: {
  onClose: () => void,
  // the dialogs' own numbers, the same the desktop panel shows
  applies: boolean,
  dialogCount?: number,
  scopeCount?: number,
  stats?: {archived: number, muted?: number, channels: number},
  // after a local folder was created / changed: pick it, so its result is seen at once
  onSelectFolder?: (id: string) => void
}) {
  // `undefined` — closed; `{}` — a new folder; `{folder}` — an existing one
  const [editing, setEditing] = createSignal<{folder?: VKLocalFolder}>();

  return (
    <>
      <VKModal title="Настроить" closeOnBackdrop onClose={props.onClose}>
        <div class="vk-modal-body vk-news-customize">
          <section class="vk-news-customize-section" aria-label="Настройки диалогов">
            <VKMessagesSettingsPanel
              id="vk-messages-customize-dialogs"
              applies={props.applies}
              dialogCount={props.dialogCount}
              scopeCount={props.scopeCount}
              stats={props.stats}
            />
          </section>

          <section class="vk-news-customize-section" aria-label="Настройка папок">
            <VKFoldersSettingsPanel
              folders={vkLocalFolders()}
              onCreate={() => setEditing({})}
              onEdit={(folder) => setEditing({folder})}
              onMove={moveVKLocalFolder}
              onRemove={removeVKLocalFolder}
              note={VK_LOCAL_FOLDERS_SETTINGS_NOTE}
            />
          </section>
        </div>
        <div class="vk-modal-foot">
          <button type="button" class="vk-button" onClick={props.onClose}>Готово</button>
        </div>
      </VKModal>

      {/* keyed: a different folder (or a new one) is a different dialog — its name
          and chats are read from the folder once, a reused instance would keep the old ones */}
      <Show when={editing()} keyed>
        {(state) => (
          <VKLocalFolderModal
            folder={state.folder}
            onClose={() => setEditing(undefined)}
            onSaved={(id) => props.onSelectFolder?.(id)}
          />
        )}
      </Show>
    </>
  );
}

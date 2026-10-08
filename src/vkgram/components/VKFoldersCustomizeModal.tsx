import {createSignal, Show} from 'solid-js';
import VKModal from '@/vkgram/components/VKModal';
import VKFolderCreateModal from '@/vkgram/components/VKFolderCreateModal';
import VKLocalFolderModal from '@/vkgram/components/VKLocalFolderModal';
import {VKFoldersSettingsPanel} from '@/vkgram/components/VKFoldersSettings';
import {VK_LOCAL_FOLDERS_SETTINGS_NOTE} from '@/vkgram/components/VKLocalFolders';
import {
  moveTgFolder,
  removeTgFolder,
  TG_FOLDERS_SETTINGS_NOTE,
  toSettingsFolders
} from '@/vkgram/pages/tgFolders/manage';
import type {ChannelFolder} from '@/vkgram/hooks/useChannelFolders';
import {
  moveVKLocalFolder,
  removeVKLocalFolder,
  vkLocalFolders,
  type VKLocalFolder
} from '@/vkgram/pages/localFolders/settings';

/**
 * «Настроить» of the sections whose folders are of two kinds — «Друзья» and
 * «Каналы» (a phone). The two strip buttons of the desktop — the management of
 * Telegram's own folders and of the local ones — merged into one window, as
 * there is no free space for either of them next to the tabs. The sections are
 * the very panel of the desktop (`VKFoldersSettingsPanel`), each with its own
 * store: the Telegram folders live in the account (no pencil — their content
 * is edited in Telegram), the local ones in the VKgram config.
 *
 * The window hosts the dialogs themselves: «Создать» of the Telegram section
 * opens Web K's folder creation window (`VKFolderCreateModal`), the local
 * section — the local folder dialog (`VKLocalFolderModal`). A local folder
 * created or changed here is picked at once (`onSelectFolder`), so its result
 * is seen in the list behind the window.
 */
export default function VKFoldersCustomizeModal(props: {
  onClose: () => void,
  // the Telegram folders of the account, in their order (the page's `folders.folders()`)
  tgFolders: ChannelFolder[],
  // after a local folder was created / changed: pick it, so its result is seen at once
  onSelectFolder?: (id: string) => void
}) {
  // `undefined` — closed; `{}` — a new folder; `{folder}` — an existing one
  const [editing, setEditing] = createSignal<{folder?: VKLocalFolder}>();
  const [creatingTg, setCreatingTg] = createSignal(false);

  return (
    <>
      <VKModal title="Настроить" closeOnBackdrop onClose={props.onClose}>
        <div class="vk-modal-body vk-news-customize">
          <section class="vk-news-customize-section" aria-label="Папки Telegram">
            <VKFoldersSettingsPanel
              title="Папки Telegram"
              folders={toSettingsFolders(props.tgFolders)}
              onCreate={() => setCreatingTg(true)}
              onMove={moveTgFolder}
              onRemove={removeTgFolder}
              note={TG_FOLDERS_SETTINGS_NOTE}
            />
          </section>

          <section class="vk-news-customize-section" aria-label="Локальные папки">
            <VKFoldersSettingsPanel
              title="Локальные папки"
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

      <Show when={creatingTg()}>
        <VKFolderCreateModal onClose={() => setCreatingTg(false)} />
      </Show>

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

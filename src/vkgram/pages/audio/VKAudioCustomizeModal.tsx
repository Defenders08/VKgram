import {createSignal, Show} from 'solid-js';
import VKModal from '@/vkgram/components/VKModal';
import {VKFoldersSettingsPanel} from '@/vkgram/components/VKFoldersSettings';
import VKAudioFolderModal from '@/vkgram/components/VKAudioFolderModal';
import {
  moveVKAudioFolder,
  removeVKAudioFolder,
  vkAudioFolders,
  type VKAudioFolder
} from '@/vkgram/pages/audio/settings';

export const VK_AUDIO_FOLDERS_SETTINGS_NOTE =
  'Папки видны рядом с вкладками «Аудиозаписей»: во вкладке папки — музыка её чатов. Хранятся только в VKgram.';

/**
 * «Настроить» of «Аудиозаписей» (a phone): the management of the audio folders
 * — the very panel the desktop side rail drops (`VKFoldersSettingsPanel` with
 * the audio store) — in one window, as there is no free space for it next to
 * the tabs. The window hosts the folder dialog itself (`VKAudioFolderModal`).
 * A folder created or changed here opens its tab at once (`onSelectFolder`).
 */
export default function VKAudioCustomizeModal(props: {
  onClose: () => void,
  // after a folder was created / changed: open its tab, so the result is seen at once
  onSelectFolder?: (id: string) => void
}) {
  // `undefined` — closed; `{}` — a new folder; `{folder}` — an existing one
  const [editing, setEditing] = createSignal<{folder?: VKAudioFolder}>();

  return (
    <>
      <VKModal title="Настроить" closeOnBackdrop onClose={props.onClose}>
        <div class="vk-modal-body vk-news-customize">
          <section class="vk-news-customize-section" aria-label="Папки">
            <VKFoldersSettingsPanel
              title="Папки"
              folders={vkAudioFolders()}
              onCreate={() => setEditing({})}
              onEdit={(folder) => setEditing({folder: folder as VKAudioFolder})}
              onMove={moveVKAudioFolder}
              onRemove={removeVKAudioFolder}
              note={VK_AUDIO_FOLDERS_SETTINGS_NOTE}
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
          <VKAudioFolderModal
            folder={state.folder}
            onClose={() => setEditing(undefined)}
            onSaved={(id) => props.onSelectFolder?.(id)}
          />
        )}
      </Show>
    </>
  );
}

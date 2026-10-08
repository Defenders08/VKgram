import {createSignal, Show} from 'solid-js';
import VKTabs from '@/vkgram/components/VKTabs';
import VKLocalFolderModal from '@/vkgram/components/VKLocalFolderModal';
import VKFoldersSettings from '@/vkgram/components/VKFoldersSettings';
import {
  moveVKLocalFolder,
  removeVKLocalFolder,
  vkLocalFolders,
  type VKLocalFolder
} from '@/vkgram/pages/localFolders/settings';

// the invitation card speaks of what a folder collects in this section («чаты»
// in «Сообщениях», «каналы» в «Новостях»…); «Аудиозаписи» has its own card
export type VKLocalFoldersSection = 'messages' | 'friends' | 'channels' | 'news';

const EMPTY_TEXTS: {[section in VKLocalFoldersSection]: string} = {
  messages: 'Соберите нужные чаты в одну папку — она появится под вкладками. Папки хранятся только в VKgram.',
  friends: 'Соберите нужных друзей в одну папку — она появится под вкладками. Папки хранятся только в VKgram.',
  channels: 'Соберите нужные каналы в одну папку — она появится под вкладками. Папки хранятся только в VKgram.',
  news: 'Соберите нужные каналы в одну папку — их записи появятся в ленте. Папки хранятся только в VKgram.'
};

export const VK_LOCAL_FOLDERS_SETTINGS_NOTE = 'Папки видны под вкладками «Сообщений», «Друзей», «Каналов» и «Новостей» — в каждом разделе свои элементы. Хранятся только в VKgram.';

/**
 * «Локальные папки» — the block that stands under the tabs block of «Сообщения»,
 * «Друзья», «Каналы» and «Новости», in the look of the folders group of
 * «Аудиозаписей»: a strip of the folder tabs with a «+» after the last one, and
 * with no folders here — a card that invites to make the first one. Picking a
 * folder filters the section's list by the folder's chats — the page owns the
 * filtering, a second click on the open folder puts it down. A folder that
 * holds none of the section's items is left out by the page, so a tab always
 * has something behind it.
 *
 * «Настроить папки» (right of the strip, the look of «Настройки ленты») opens
 * the shared folder settings panel (`VKFoldersSettings`) over this section's
 * store — every folder there is, whatever section shows it.
 */
export default function VKLocalFolders(props: {
  // the folders of this section, in the user's order
  folders: VKLocalFolder[],
  // the picked folder (its filter is applied); none — no folder is
  activeId?: string,
  // a click on a folder tab: pick it, or — on the picked one — put it down
  onToggle: (id: string) => void,
  // after a folder was created / changed it is picked, so its result is seen at once
  onSelect?: (id: string) => void,
  // the accessible name of the strip and the prefix of its tab ids (unique per section and layout)
  label?: string,
  idPrefix: string,
  // what the invitation card says a folder collects here
  section: VKLocalFoldersSection,
  // the settings button of the strip (edit / move / delete of every local folder);
  // a section may host it elsewhere — then it passes false here
  withSettings?: boolean,
  // «+» not after the last tab but at the right end of the row under the strip,
  // next to «Настроить папки» — the look of «Настройки ленты  +» (the side blocks)
  addInFooter?: boolean
}) {
  // `undefined` — closed; `{}` — a new folder; `{folder}` — an existing one
  const [editing, setEditing] = createSignal<{folder?: VKLocalFolder}>();

  // the tabs are the section's folders as they are
  const tabs = () => props.folders.map((folder) => ({id: folder.id, title: folder.title}));

  return (
    <section class="vk-local-folders vk-side-folders" aria-label={props.label ?? 'Локальные папки'}>
      <Show
        when={props.folders.length}
        fallback={
          <div class="vk-media-group-empty">
            <p class="vk-media-group-empty-title">Добавьте локальные папки</p>
            <p class="vk-media-group-empty-text">
              {EMPTY_TEXTS[props.section]}
            </p>
            <button type="button" class="vk-link-button vk-media-group-empty-button" onClick={() => setEditing({})}>
              Создать папку
            </button>
          </div>
        }
      >
        <VKTabs
          tabs={tabs()}
          active={(props.activeId ?? '') as string}
          onChange={props.onToggle}
          idPrefix={props.idPrefix}
          label={props.label}
          addLabel="Новая папка"
          onAdd={() => setEditing({})}
          addInFooter={props.addInFooter}
          actions={props.withSettings === false ? undefined : (
            <VKFoldersSettings
              id={`${props.idPrefix}-settings`}
              folders={vkLocalFolders()}
              onCreate={() => setEditing({})}
              onEdit={(folder) => setEditing({folder})}
              onMove={moveVKLocalFolder}
              onRemove={removeVKLocalFolder}
              note={VK_LOCAL_FOLDERS_SETTINGS_NOTE}
            />
          )}
        />
      </Show>

      {/* keyed: a different folder (or a new one) is a different dialog — its name
          and chats are read from the folder once, a reused instance would keep the old ones */}
      <Show when={editing()} keyed>
        {(state) => (
          <VKLocalFolderModal
            folder={state.folder}
            onClose={() => setEditing(undefined)}
            onSaved={(id) => props.onSelect?.(id)}
          />
        )}
      </Show>
    </section>
  );
}

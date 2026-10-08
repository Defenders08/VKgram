import {createEffect, createSignal, For, onCleanup, Show} from 'solid-js';
import VKIcon from '@/vkgram/components/VKIcons';
import {animateMove, animateOut} from '@/vkgram/utils/animate';

/**
 * A folder a settings panel manages. The shape of both folder stores — the local
 * folders of «Сообщений», «Друзей», «Каналов» и «Новостей»
 * (`pages/localFolders/settings`) and the ones of «Аудиозаписей»
 * (`pages/audio/settings`) — so one panel serves every section.
 */
export type VKSettingsFolder = {
  id: string,
  title: string,
  peerIds: PeerId[]
};

const pluralChats = (count: number) => {
  const last = count % 10;
  if(count % 100 >= 11 && count % 100 <= 14) return `${count} чатов`;
  return `${count} ${last === 1 ? 'чат' : last >= 2 && last <= 4 ? 'чата' : 'чатов'}`;
};

/**
 * The content of the «Настройка папок» panel: every folder there is — whatever
 * section shows it — with «изменить», «выше», «ниже» and «удалить» (the delete
 * asks for a confirmation first). The panel owns nothing: creation and editing
 * are the caller's dialogs (`onCreate` / `onEdit`), moving and removing go to
 * its store (`onMove` / `onRemove`, the row folds up before it is taken out).
 *
 * Shared by the dropdown at the right end of the folder tabs
 * (`VKFoldersSettings`, the side blocks) and the merged «Настроить» window of
 * the mobile top bar (`VKNewsCustomizeModal`): the markup of the dropdown
 * stays the same.
 */
export function VKFoldersSettingsPanel(props: {
  // the section title; the dropdown keeps its own («Настройка папок»), the merged
  // windows of the mobile top bar name the folder kind («Папки Telegram», …)
  title?: string,
  // every folder of the store, in the user's order — not only the visible ones
  folders: VKSettingsFolder[],
  onCreate: () => void,
  // the folder editor; a store that cannot edit its folders (Telegram's own ones)
  // leaves it out, and the rows have no pencil
  onEdit?: (folder: VKSettingsFolder) => void,
  onMove: (id: string, shift: -1 | 1) => void,
  // called after the confirm step, the row is folded up by then
  onRemove: (id: string) => void,
  // the line under the list: where the folders show up
  note: string
}) {
  // the folder whose «удалить» was pressed once: the next press removes it
  const [confirmDeleteId, setConfirmDeleteId] = createSignal<string>();

  let root: HTMLDivElement;

  const move = (id: string, shift: -1 | 1) => {
    animateMove(
      () => [...root.querySelectorAll<HTMLElement>('[data-vk-folder-row]')],
      () => props.onMove(id, shift)
    );
  };

  // the folder folds up first, then it is taken out
  const remove = async(folder: VKSettingsFolder) => {
    if(confirmDeleteId() !== folder.id) {
      setConfirmDeleteId(folder.id);
      return;
    }
    const row = root.querySelector<HTMLElement>(`[data-vk-folder-row="${folder.id}"]`);
    if(row) await animateOut(row);
    props.onRemove(folder.id);
  };

  return (
    <div ref={root}>
      <div class="vk-news-settings-head">
        <span class="vk-news-settings-title">{props.title ?? 'Настройка папок'}</span>
        <button type="button" class="vk-link-button" onClick={props.onCreate}>Создать</button>
      </div>

      {/* the wrapper carries the row styles of «Настройки страницы», this list is drawn the same way */}
      <div class="vk-home-blocks">
        <Show
          when={props.folders.length}
          fallback={<p class="vk-page-text vk-page-text-secondary vk-header-settings-empty">Папок пока нет.</p>}
        >
          <ul class="vk-header-settings-blocks">
            <For each={props.folders}>
              {(folder, index) => (
                <li class="vk-header-settings-block" data-vk-folder-row={folder.id}>
                  <span class="vk-header-settings-block-icon" aria-hidden="true">
                    <VKIcon name="bookmark" size={14} />
                  </span>
                  <span class="vk-header-settings-block-info">
                    <span class="vk-header-settings-block-title">{folder.title}</span>
                    <span class="vk-page-text-secondary">{pluralChats(folder.peerIds.length)}</span>
                  </span>
                  <Show when={props.onEdit}>
                    <button
                      type="button"
                      class="vk-header-settings-icon"
                      aria-label={`Изменить папку «${folder.title}»`}
                      title="Изменить"
                      onClick={() => props.onEdit?.(folder)}
                    >
                      <VKIcon name="edit" size={14} />
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="vk-header-settings-icon"
                    aria-label={`Поднять выше: ${folder.title}`}
                    title="Выше"
                    disabled={index() === 0}
                    onClick={() => move(folder.id, -1)}
                  >
                    <VKIcon name="up" size={14} />
                  </button>
                  <button
                    type="button"
                    class="vk-header-settings-icon vk-header-settings-down"
                    aria-label={`Опустить ниже: ${folder.title}`}
                    title="Ниже"
                    disabled={index() === props.folders.length - 1}
                    onClick={() => move(folder.id, 1)}
                  >
                    <VKIcon name="up" size={14} />
                  </button>
                  <Show
                    when={confirmDeleteId() === folder.id}
                    fallback={
                      <button
                        type="button"
                        class="vk-header-settings-icon"
                        aria-label={`Удалить папку «${folder.title}»`}
                        title="Удалить"
                        onClick={() => void remove(folder)}
                      >
                        <VKIcon name="close" size={14} />
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="vk-folders-remove-confirm"
                      aria-label={`Точно удалить папку «${folder.title}»?`}
                      onClick={() => void remove(folder)}
                    >
                      Точно удалить?
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>

      <p class="vk-news-settings-note">{props.note}</p>
    </div>
  );
}

/**
 * «Настройка папок»: the button at the right end of the folder tabs (the look of
 * «Настройки ленты») and the small panel that drops from it, in the manner of
 * «Настройки страницы» — the content of the panel is `VKFoldersSettingsPanel`.
 * It closes on a click outside and on Escape, the focus goes back to the
 * button; closing the panel puts the delete confirmation down too.
 */
export default function VKFoldersSettings(props: {
  // the id of the panel (aria-controls); unique per section and layout
  id: string,
  // every folder of the store, in the user's order — not only the visible ones
  folders: VKSettingsFolder[],
  onCreate: () => void,
  // the folder editor; a store that cannot edit its folders (Telegram's own ones)
  // leaves it out, and the rows have no pencil
  onEdit?: (folder: VKSettingsFolder) => void,
  onMove: (id: string, shift: -1 | 1) => void,
  // called after the confirm step, the row is folded up by then
  onRemove: (id: string) => void,
  // the line under the list: where the folders show up
  note: string
}) {
  const [isOpen, setOpen] = createSignal(false);

  let root: HTMLDivElement;
  let button: HTMLButtonElement;

  createEffect(() => {
    if(!isOpen()) return;

    const onPointerDown = (e: PointerEvent) => {
      if(!root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'Escape' || !isOpen()) return;
    e.stopPropagation();
    setOpen(false);
    button.focus();
  };

  // the delete confirmation lives in the panel: it goes down with the panel
  // itself when the dropdown closes

  return (
    <div ref={root} class="vk-news-settings-holder vk-folders-settings-holder" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        class="vk-link-button vk-news-settings-button"
        aria-expanded={isOpen()}
        aria-controls={props.id}
        onClick={() => setOpen((open) => !open)}
      >
        <VKIcon name="settings" size={14} />
        <span>Настроить папки</span>
      </button>

      <Show when={isOpen()}>
        <div id={props.id} class="vk-news-settings vk-folders-settings" role="group" aria-label="Настройка папок">
          <VKFoldersSettingsPanel
            folders={props.folders}
            onCreate={props.onCreate}
            onEdit={props.onEdit}
            onMove={props.onMove}
            onRemove={props.onRemove}
            note={props.note}
          />
        </div>
      </Show>
    </div>
  );
}

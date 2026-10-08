import {createSignal, Show} from 'solid-js';
import type {DialogFilter} from '@layer';
import VKModal from '@/vkgram/components/VKModal';
import VKTabs, {type VKTabItem} from '@/vkgram/components/VKTabs';
import {VKFolderCreateForm} from '@/vkgram/components/VKFolderCreateModal';
import {VKLocalFolderForm} from '@/vkgram/components/VKLocalFolderModal';

type FolderKind = 'local' | 'tg';

const KIND_TABS: VKTabItem<FolderKind>[] = [
  {id: 'local', title: 'Локальная папка'},
  {id: 'tg', title: 'Папка Telegram'}
];

/**
 * «Новая папка» of the mobile tabs: both folder kinds in one window, side by
 * side as its tabs. «Локальная папка» saves into the VKgram config only
 * (`VKLocalFolderForm`), «Папка Telegram» — into the account's chat folders
 * (`VKFolderCreateForm`, the same flow as the desktop «+»). The forms are the
 * bodies of their dialogs: the window holds the tabs and the active form, the
 * form reports its saving so the window does not close mid-save.
 */
export default function VKFolderAddModal(props: {
  onClose: () => void,
  // after a local folder was created: its id (the tabs of the page pick it up)
  onCreatedLocal?: (id: string) => void,
  // after a Telegram folder was created (the id comes from the storage)
  onCreatedFilter?: (filter: DialogFilter) => void
}) {
  const [kind, setKind] = createSignal<FolderKind>('local');
  const [saving, setSaving] = createSignal(false);

  return (
    <VKModal title="Новая папка" width={440} closeDisabled={saving()} onClose={props.onClose}>
      <div class="vk-folder-add-tabs">
        <VKTabs
          tabs={KIND_TABS}
          active={kind()}
          onChange={setKind}
          idPrefix="vk-folder-add"
          label="Тип папки"
        />
      </div>
      {/* the forms keep their own state: a switch of the tab starts the other one fresh */}
      <Show
        when={kind() === 'local'}
        fallback={
          <VKFolderCreateForm
            onClose={props.onClose}
            onCreated={props.onCreatedFilter}
            onSavingChange={setSaving}
          />
        }
      >
        <VKLocalFolderForm onClose={props.onClose} onSaved={props.onCreatedLocal} />
      </Show>
    </VKModal>
  );
}

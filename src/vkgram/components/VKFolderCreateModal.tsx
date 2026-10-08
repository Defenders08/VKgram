import {createSignal, For, Show} from 'solid-js';
import type {DialogFilter, TextWithEntities, User, Chat} from '@layer';
import rootScope from '@lib/rootScope';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import {toastNew} from '@components/toast';
import {InputFieldTsx} from '@components/inputFieldTsx';
import {InputFieldEmoji} from '@components/inputFieldEmoji';
import InputField from '@components/inputField';
import {AvatarNewTsx} from '@components/avatarNew';
import {usePeers} from '@stores/peers';
import VKIcon from '@/vkgram/components/VKIcons';
import VKModal from '@/vkgram/components/VKModal';
import VKChatsPickerModal from '@/vkgram/components/VKChatsPickerModal';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';

type AnyPeer = User.user | Exclude<Chat, Chat.chatEmpty>;

const peerTitle = (peer: AnyPeer | undefined) => {
  if(!peer) return '';
  if(peer._ === 'user') {
    return [peer.first_name, peer.last_name].filter(Boolean).join(' ') || peer.username || '';
  }
  return peer.title;
};

// the types of chats a folder can hold on its include side, and the flags of
// its exclude side — the same keys Web K's folder editor writes into pFlags
const INCLUDE_TYPES: Array<{flag: 'contacts' | 'non_contacts' | 'groups' | 'broadcasts' | 'bots', title: string}> = [
  {flag: 'contacts', title: 'Контакты'},
  {flag: 'non_contacts', title: 'Не контакты'},
  {flag: 'groups', title: 'Группы'},
  {flag: 'broadcasts', title: 'Каналы'},
  {flag: 'bots', title: 'Боты'}
];

const EXCLUDE_FLAGS: Array<{flag: 'exclude_muted' | 'exclude_read' | 'exclude_archived', title: string}> = [
  {flag: 'exclude_muted', title: 'Заглушённые'},
  {flag: 'exclude_read', title: 'Прочитанные'},
  {flag: 'exclude_archived', title: 'Архив'}
];

/**
 * «Новая папка» in a `VKModal` — the create flow of Web K's folder editor in
 * the VKgram window language: the name with its emoji button
 * (`InputFieldEmoji`, the same input the editor uses), the included and
 * excluded chats (picked in `VKChatsPickerModal`, kept as peer ids and turned
 * into input peers on save), the chat-type flags of the filter and the save
 * through `filtersStorage.createDialogFilter` — the same call, the same
 * folder-limit popup on `DIALOG_FILTERS_TOO_MUCH`. The tabs of «Новости» /
 * «Каналы» pick the new folder up from Web K's own `filter_update` event.
 *
 * Editing an existing folder (its invite links included) stays in Web K.
 *
 * The form itself is `VKFolderCreateForm`: the body and the foot of the dialog.
 * The combined «Новая папка» window of the mobile tabs (`VKFolderAddModal`)
 * hosts the same form under its «Папка Telegram» tab.
 */
export default function VKFolderCreateModal(props: {
  onClose: () => void,
  // called after the filter has been created (the id comes from the storage)
  onCreated?: (filter: DialogFilter) => void
}) {
  const [saving, setSaving] = createSignal(false);

  return (
    <VKModal title="Новая папка" width={440} closeDisabled={saving()} onClose={props.onClose}>
      <VKFolderCreateForm onClose={props.onClose} onCreated={props.onCreated} onSavingChange={setSaving} />
    </VKModal>
  );
}

export function VKFolderCreateForm(props: {
  onClose: () => void,
  onCreated?: (filter: DialogFilter) => void,
  // reported while the filter is being created: the window must not close mid-save
  onSavingChange?: (saving: boolean) => void
}) {
  const peers = usePeers();

  let nameField: InputFieldEmoji;
  const [includeIds, setIncludeIds] = createSignal<PeerId[]>([]);
  const [excludeIds, setExcludeIds] = createSignal<PeerId[]>([]);
  const [includeFlags, setIncludeFlags] = createSignal<Set<string>>(new Set());
  const [excludeFlags, setExcludeFlags] = createSignal<Set<string>>(new Set());
  const [pickerFor, setPickerFor] = createSignal<'include' | 'exclude' | undefined>();
  const [saving, setSaving] = createSignal(false);

  const reportSaving = (value: boolean) => {
    setSaving(value);
    props.onSavingChange?.(value);
  };

  const toggleFlag = (which: 'include' | 'exclude', flag: string, checked: boolean) => {
    const setter = which === 'include' ? setIncludeFlags : setExcludeFlags;
    setter((prev) => {
      const next = new Set(prev);
      if(checked) next.add(flag);
      else next.delete(flag);
      return next;
    });
  };

  const removePeer = (which: 'include' | 'exclude', peerId: PeerId) => {
    const setter = which === 'include' ? setIncludeIds : setExcludeIds;
    setter((ids) => ids.filter((id) => id !== peerId));
  };

  const save = async() => {
    const nameInput = nameField?.input;
    const rich = getRichValueWithCaret(nameInput);
    const title = rich.value.trim();
    if(!title) {
      nameInput.classList.add('error');
      return;
    }

    const includePeerIds = includeIds();
    const excludePeerIds = excludeIds();
    const hasInclude = !!includePeerIds.length || !!includeFlags().size;
    if(!hasInclude) {
      toastNew({langPackKey: 'EditFolder.Toast.ChooseChat'});
      return;
    }

    const titleWithEntities: TextWithEntities = {_: 'textWithEntities', text: rich.value, entities: rich.entities};

    const includePeers = await Promise.all(includePeerIds.map((peerId) => rootScope.managers.appPeersManager.getInputPeerById(peerId)));
    const excludePeers = await Promise.all(excludePeerIds.map((peerId) => rootScope.managers.appPeersManager.getInputPeerById(peerId)));

    const filter: DialogFilter.dialogFilter = {
      _: 'dialogFilter',
      id: 0,
      title: titleWithEntities,
      pFlags: {
        ...(includeFlags().has('contacts') ? {contacts: true} : {}),
        ...(includeFlags().has('non_contacts') ? {non_contacts: true} : {}),
        ...(includeFlags().has('groups') ? {groups: true} : {}),
        ...(includeFlags().has('broadcasts') ? {broadcasts: true} : {}),
        ...(includeFlags().has('bots') ? {bots: true} : {}),
        ...(excludeFlags().has('exclude_muted') ? {exclude_muted: true} : {}),
        ...(excludeFlags().has('exclude_read') ? {exclude_read: true} : {}),
        ...(excludeFlags().has('exclude_archived') ? {exclude_archived: true} : {})
      },
      pinned_peers: [],
      include_peers: includePeers,
      exclude_peers: excludePeers,
      pinnedPeerIds: [],
      includePeerIds,
      excludePeerIds
    };

    reportSaving(true);
    try {
      const created = await rootScope.managers.filtersStorage.createDialogFilter(filter);
      props.onCreated?.(created);
      props.onClose();
    } catch(err: any) {
      if(err?.type === 'DIALOG_FILTERS_TOO_MUCH') {
        const {default: showLimitPopup} = await import('@components/popups/limit');
        showLimitPopup('folders');
      } else {
        console.error('VKgram: createDialogFilter failed', err);
        toastNew({langPackKey: 'Error.AnError'});
      }
    } finally {
      reportSaving(false);
    }
  };

  const chatRows = (which: 'include' | 'exclude') => {
    const ids = which === 'include' ? includeIds() : excludeIds();
    return (
      <For each={ids}>
        {(peerId) => (
          <div class="vk-folder-chat">
            <AvatarNewTsx peerId={peerId} size={32} />
            <span class="vk-folder-chat-title">{peerTitle(peers[peerId] as AnyPeer | undefined)}</span>
            <button
              type="button"
              class="vk-folder-chat-remove"
              aria-label="Убрать"
              onClick={() => removePeer(which, peerId)}
            >
              <VKIcon name="close" size={14} />
            </button>
          </div>
        )}
      </For>
    );
  };

  return (
    <Show when={!pickerFor()} fallback={
      <VKChatsPickerModal
        title={pickerFor() === 'include' ? 'Включить чаты' : 'Исключить чаты'}
        selected={pickerFor() === 'include' ? includeIds() : excludeIds()}
        onDone={(ids) => {
          if(pickerFor() === 'include') setIncludeIds(ids);
          else setExcludeIds(ids);
          setPickerFor(undefined);
        }}
        onClose={() => setPickerFor(undefined)}
      />
    }>
      <div class="vk-modal-body vk-folder-create">
        <div class="vk-folder-name">
          <InputFieldTsx
            InputFieldClass={InputFieldEmoji}
            label="FilterNameHint"
            instanceRef={(ref) => { nameField = ref as InputFieldEmoji; }}
          />
        </div>

        <section class="vk-folder-section">
          <h3 class="vk-folder-section-title">Включённые чаты</h3>
          <div class="vk-folder-chats">{chatRows('include')}</div>
          <button type="button" class="vk-folder-add" onClick={() => setPickerFor('include')}>
            <VKIcon name="plus" size={16} />
            Добавить чаты
          </button>
          <div class="vk-folder-flags">
            <For each={INCLUDE_TYPES}>
              {({flag, title}) => (
                <Choice
                  type="checkbox"
                  checked={includeFlags().has(flag)}
                  onChange={(checked) => toggleFlag('include', flag, checked)}
                >
                  {title}
                </Choice>
              )}
            </For>
          </div>
          <p class="vk-folder-note vk-page-text-secondary">
            Чаты и типы чатов, которые попадут в эту папку.
          </p>
        </section>

        <section class="vk-folder-section">
          <h3 class="vk-folder-section-title">Исключённые чаты</h3>
          <div class="vk-folder-chats">{chatRows('exclude')}</div>
          <button type="button" class="vk-folder-add" onClick={() => setPickerFor('exclude')}>
            <VKIcon name="minus" size={16} />
            Убрать чаты
          </button>
          <div class="vk-folder-flags">
            <For each={EXCLUDE_FLAGS}>
              {({flag, title}) => (
                <Choice
                  type="checkbox"
                  checked={excludeFlags().has(flag)}
                  onChange={(checked) => toggleFlag('exclude', flag, checked)}
                >
                  {title}
                </Choice>
              )}
            </For>
          </div>
          <p class="vk-folder-note vk-page-text-secondary">
            Чаты и типы чатов, которых в этой папке не будет.
          </p>
        </section>

        <p class="vk-folder-note vk-page-text-secondary">
          Папка появится в «Сообщениях» и во вкладках «Новостей» и «Каналов».
        </p>
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button vk-button-secondary" disabled={saving()} onClick={props.onClose}>Отмена</button>
        <button type="button" class="vk-button" disabled={saving()} onClick={save}>Сохранить</button>
      </div>
    </Show>
  );
}

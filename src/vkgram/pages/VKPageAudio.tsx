import {createMemo, createSignal, Show} from 'solid-js';
import type {UserFull} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import rootScope from '@lib/rootScope';
import {useFullPeer} from '@stores/fullPeers';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openWebKSavedMusic} from '@/vkgram/webk';
import createSavedMusic from '@/vkgram/hooks/createSavedMusic';
import createFakeAudioMessages from '@/vkgram/hooks/createFakeAudioMessages';
import createIncrementalList from '@/vkgram/hooks/createIncrementalList';
import matchesQuery from '@/vkgram/utils/matchesQuery';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKEmptyState from '@/vkgram/components/VKEmptyState';
import VKTrackRow from '@/vkgram/components/VKTrackRow';
import {VKAudioRows} from '@/vkgram/components/VKAudioItem';
import VKAudioPlayer from '@/vkgram/components/VKAudioPlayer';
import VKAudioFolderTab from '@/vkgram/components/VKAudioFolderTab';
import VKAudioFolderModal from '@/vkgram/components/VKAudioFolderModal';
import VKFoldersSettings from '@/vkgram/components/VKFoldersSettings';
import VKMediaPage, {VKMediaList, type VKMediaTab} from '@/vkgram/components/VKMediaBrowser';
import useAudioCustomize from '@/vkgram/pages/audio/customize';
import VKAudioCustomizeModal, {VK_AUDIO_FOLDERS_SETTINGS_NOTE} from '@/vkgram/pages/audio/VKAudioCustomizeModal';
import {
  moveVKAudioFolder,
  removeVKAudioFolder,
  vkAudioFolders,
  type VKAudioFolder
} from '@/vkgram/pages/audio/settings';

// how many tracks are asked for; the rest of a longer playlist stays in Web K's own tab
const LIMIT = 100;

/**
 * «Аудиозаписи», tabs as in Telegram's shared media:
 * «Поиск» — the music of all chats (Telegram's global search, music only),
 * «Избранное» — the music kept in the saved messages,
 * «Аудиостатус» — the music of the user's profile (`VKAudioStatus`),
 * «Голосовые» — the voice messages of all chats (global search, voice only).
 * The player block (`VKAudioPlayer`) is over all of them, not in a tab: it stays as the tab changes.
 * The tracks of the lists play in Web K's global player.
 *
 * «Папки» — a block of tabs of its own next to those: the user's LOCAL folders of chats and
 * channels, each showing the music of its chats. They are kept in the VKgram config
 * (`pages/audio/settings`, the section «audio»), not in the Telegram account.
 */
const BASE_TABS: VKMediaTab<string>[] = [
  {id: 'search', title: 'Поиск', searchPlaceholder: 'Поиск музыки', render: (search) => <VKMediaList kind="music" source="search" query={search.query} onQueryInput={search.onInput} />},
  {id: 'saved', title: 'Избранное', render: () => <VKMediaList kind="music" source="saved" />},
  {id: 'status', title: 'Аудиостатус', render: () => <VKAudioStatus />},
  {id: 'voice', title: 'Голосовые', searchPlaceholder: 'Поиск голосовых сообщений', render: (search) => <VKMediaList kind="voice" source="search" query={search.query} onQueryInput={search.onInput} />}
];

const folderTabId = (folder: VKAudioFolder) => `folder_${folder.id}`;

export default function VKPageAudio() {
  // `undefined` — closed; `{}` — a new folder; `{folder}` — an existing one
  const [editing, setEditing] = createSignal<{folder?: VKAudioFolder}>();
  const [openTab, setOpenTab] = createSignal<{id: string}>();
  // «Настроить»: the management of the audio folders in one window; the signal is
  // module-level — the icon of the mobile top bar opens the same window
  const [isSettingsOpen, setSettingsOpen] = useAudioCustomize();

  const folderTabs = createMemo((): VKMediaTab<string>[] => vkAudioFolders().map((folder) => ({
    id: folderTabId(folder),
    title: folder.title,
    render: () => <VKAudioFolderTab folder={folder} onEdit={() => setEditing({folder})} />
  })));

  return (
    <>
      <VKMediaPage
        section="audio"
        top={<VKAudioPlayer />}
        tabs={BASE_TABS}
        groups={[{
          title: 'Локальные папки',
          tabs: folderTabs(),
          onAdd: () => setEditing({}),
          addLabel: 'Новая папка',
          // the shared folder settings panel: every audio folder — edit, move, delete
          actions: (
            <VKFoldersSettings
              id="vk-audio-folders-settings"
              folders={vkAudioFolders()}
              onCreate={() => setEditing({})}
              onEdit={(folder) => setEditing({folder: folder as VKAudioFolder})}
              onMove={moveVKAudioFolder}
              onRemove={removeVKAudioFolder}
              note={VK_AUDIO_FOLDERS_SETTINGS_NOTE}
            />
          ),
          empty: {
            title: 'Добавьте локальные папки',
            description: 'Соберите музыку из выбранных чатов и каналов в одну вкладку. Папки хранятся только в VKgram.',
            button: 'Создать папку'
          }
        }]}
        openTab={openTab()}
      />
      <Show when={editing()} keyed>
        {(state) => (
          <VKAudioFolderModal
            folder={state.folder}
            onClose={() => setEditing(undefined)}
            onSaved={(id) => setOpenTab({id: `folder_${id}`})}
          />
        )}
      </Show>
      <Show when={isSettingsOpen()}>
        <VKAudioCustomizeModal
          onClose={() => setSettingsOpen(false)}
          onSelectFolder={(id) => setOpenTab({id: `folder_${id}`})}
        />
      </Show>
    </>
  );
}

/**
 * «Аудиостатус» of «Аудиозаписи» — the tracks of the signed-in user's profile music (the same
 * list «Все треки» of Web K opens), in the old VK's audio-list shape: a
 * search and compact one-line rows: a small play / pause
 * button, «исполнитель — название», duration.
 *
 * There is no player of its own: what plays is Web K's global one
 * (`appMediaPlaybackController`). The tracks are documents, not chat messages: each is
 * given the local message Web K's own playlist tab renders it from
 * (`createFakeAudioMessages`), so a row is Web K's audio row and plays like one.
 */
function VKAudioStatus() {
  const myPeerId = rootScope.myId;
  const fullPeer = useFullPeer(myPeerId);
  const userFull = () => fullPeer() as UserFull.userFull;

  const music = createSavedMusic({
    peerId: () => myPeerId,
    limit: LIMIT,
    refreshKey: () => (userFull()?.saved_music as MyDocument)?.id
  });
  const [query, setQuery] = createSignal('');

  const filtered = createMemo(() => {
    const tracks = music.tracks();
    if(!tracks) return;
    return tracks.filter((doc) => {
      const titles = getAudioTitles(doc);
      return matchesQuery(query(), titles?.title, titles?.performer);
    });
  });

  const list = createIncrementalList({
    total: () => filtered()?.length ?? 0,
    resetKey: query
  });
  const visible = createMemo(() => filtered()?.slice(0, list.count()) ?? []);
  const total = () => music.count() ?? music.tracks()?.length ?? 0;

  const visibleMessages = createFakeAudioMessages({docs: visible, peerId: myPeerId});
  const openPlaylist = () => openWebKSavedMusic(myPeerId);

  return (
    <div class="vk-audio">
      <Show when={music.tracks()?.length}>
        <p class="vk-page-text vk-page-text-secondary">Музыка вашего профиля: {total()}</p>
      </Show>

      <Show when={music.tracks()?.length}>
        <VKSearchField value={query()} placeholder="Поиск аудиозаписей" onInput={setQuery} />
      </Show>

      <Show
        when={filtered()}
        fallback={<p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка аудиозаписей…</p>}
      >
        <Show
          when={music.tracks().length}
          fallback={
            <VKEmptyState
              icon="audio"
              title="Аудиозаписей пока нет"
              description="Музыка из вашего профиля Telegram появится здесь."
            />
          }
        >
          <Show
            when={filtered().length}
            fallback={<p class="vk-page-text vk-page-text-secondary vk-list-empty">Ничего не найдено.</p>}
          >
            <Show when={visibleMessages().length}>
              <VKAudioRows messages={visibleMessages()} />
            </Show>
            <div ref={list.setSentinel} class="vk-list-sentinel" />
          </Show>

          <Show when={total() > music.tracks().length}>
            <button type="button" class="vk-link-button vk-audio-more" onClick={openPlaylist}>
              Показать все в «Телеграм»
            </button>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

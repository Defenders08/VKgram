import {createSignal, onCleanup} from 'solid-js';
import rootScope from '@lib/rootScope';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import {fetchFolder} from '@/vkgram/hooks/useSubscribedChannels';

export type ChannelFolder = {
  id: number,
  title: string,
  // every peer of the folder: the chats of any kind, so match it against the channels
  peerIds: Set<PeerId>
};

// Web K reports folder events often; the same folders must not rebuild the tabs
const isSameFolders = (a: ChannelFolder[], b: ChannelFolder[]) => a.length === b.length && a.every((folder, index) => {
  const other = b[index];
  return folder.id === other.id && folder.title === other.title &&
    folder.peerIds.size === other.peerIds.size && [...folder.peerIds].every((peerId) => other.peerIds.has(peerId));
});

// shown when a folder has no readable title (never a technical name)
const UNTITLED = 'Без названия';

// A folder title is a string, or `{text}` (`textWithEntities`) in newer layers;
// the text of a `{text}` can itself be wrapped once more.
const getTitle = (title: unknown): string => {
  if(typeof title === 'string') return title.trim();
  if(title && typeof title === 'object') return getTitle((title as {text?: unknown}).text);
  return '';
};

/**
 * The user's own chat folders (the ones of Web K's chat list — «Игры»,
 * «Музыка»…, not «Все» and not the archive) and what is in each of them.
 *
 * NB: the one place that reads them. The list of folders is
 * `filtersStorage.getDialogFilters()`; the members of a folder come from
 * `dialogsStorage.getDialogs({filterId})` — the same call `useSubscribedChannels`
 * makes for the two built-in folders, here with a folder's id. It is read
 * again when Web K reports that a folder was changed, deleted or reordered.
 * A chat that joins a folder by the folder's own rules without such an
 * event shows up after the next of them.
 */
export default function useChannelFolders() {
  const listenerSetter = createListenerSetter();
  const [folders, setFolders] = createSignal<ChannelFolder[]>([]);
  const [isReady, setReady] = createSignal(false);

  let alive = true;
  let generation = 0;
  onCleanup(() => {
    alive = false;
  });

  const load = async() => {
    const current = ++generation;
    const isCurrent = () => alive && current === generation;
    try {
      const filters: any[] = await rootScope.managers.filtersStorage.getDialogFilters();
      // the user's own folders only: «Все» and the archive are Web K's built-ins, not folders
      const custom = filters.filter((filter) => {
        return (filter._ === 'dialogFilter' || filter._ === 'dialogFilterChatlist') &&
          filter.id !== FOLDER_ID_ALL && filter.id !== FOLDER_ID_ARCHIVE;
      });
      const loaded = await Promise.all(custom.map(async(filter): Promise<ChannelFolder> => {
        let peerIds = new Set<PeerId>();
        try {
          peerIds = new Set((await fetchFolder(filter.id, isCurrent)).map((dialog) => dialog.peerId));
        } catch(err) {
          // one folder that can't be read must not take the other tabs away
          console.error('VKgram: failed to load the folder', filter.id, err);
        }

        let title = getTitle(filter.title);
        if(!title) {
          // say what the title looked like, so a new shape of it is found and read
          console.warn('VKgram: a folder title could not be read', filter.id, filter.title);
          title = UNTITLED;
        }

        return {id: filter.id, title, peerIds};
      }));
      if(isCurrent()) setFolders((prev) => isSameFolders(prev, loaded) ? prev : loaded);
    } catch(err) {
      // no folders: only «Все» is left
      console.error('VKgram: failed to load the chat folders', err);
      if(isCurrent()) setFolders([]);
    } finally {
      if(alive) setReady(true);
    }
  };

  load();
  (['filter_update', 'filter_delete', 'filter_order'] as const).forEach((event) => {
    listenerSetter.add(rootScope)(event as any, load as any);
  });

  return {folders, isReady};
}

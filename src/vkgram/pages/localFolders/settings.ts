import {createVKConfigSection, isPlainObject} from '@/vkgram/config';

/**
 * «Локальные папки» — a section («localFolders») of the VKgram config, so they
 * are exported and imported with the rest (see `vkgram/config.ts`). A folder is
 * a name and a set of chats / channels; the sections «Сообщения», «Друзья»,
 * «Каналы» and «Новости» each show a block of these folders under their tabs
 * and filter their list by the chosen one. They are NOT Telegram's chat
 * folders: nothing is written to the account, they exist in this browser (and
 * in the config file) — the same way the local folders of «Аудиозаписей» do.
 */
export type VKLocalFolder = {
  id: string,
  title: string,
  peerIds: PeerId[]
};

export type VKLocalFoldersSettings = {
  folders: VKLocalFolder[]
};

export const VK_LOCAL_FOLDER_TITLE_MAX = 40;
const MAX_FOLDERS = 30;
const MAX_PEERS = 200;

// never mutated: the section hands out copies of it
const DEFAULTS: VKLocalFoldersSettings = {folders: []};

const createId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const cleanTitle = (title: string) => title.trim().slice(0, VK_LOCAL_FOLDER_TITLE_MAX);

// peer ids are non-zero numbers; anything else in the file is not a chat
const cleanPeerIds = (raw: unknown[]): PeerId[] => {
  const ids = raw.filter((value): value is number => Number.isSafeInteger(value) && value !== 0);
  return [...new Set(ids)].slice(0, MAX_PEERS) as PeerId[];
};

// a field of the wrong type is not a choice: the default decides; a broken folder is dropped, not the rest
const parse = (raw: unknown): VKLocalFoldersSettings | undefined => {
  if(!isPlainObject(raw)) return undefined;
  if(!Array.isArray(raw.folders)) return {folders: []};

  const folders: VKLocalFolder[] = [];
  const ids = new Set<string>();
  for(const item of raw.folders) {
    if(folders.length >= MAX_FOLDERS) break;
    if(!isPlainObject(item) || typeof item.title !== 'string' || !Array.isArray(item.peerIds)) continue;

    const title = cleanTitle(item.title);
    if(!title) continue;

    const peerIds = cleanPeerIds(item.peerIds);
    // a folder without chats would show up in no section: drop it, not keep a zombie
    if(!peerIds.length) continue;

    let id = typeof item.id === 'string' && /^[\w-]{1,40}$/.test(item.id) ? item.id : createId();
    if(ids.has(id)) id = createId();
    ids.add(id);

    folders.push({id, title, peerIds});
  }
  return {folders};
};

const section = createVKConfigSection<VKLocalFoldersSettings>({
  key: 'localFolders',
  title: 'Локальные папки',
  defaults: DEFAULTS,
  parse
});

export const vkLocalFoldersSettings = section.value;

export const vkLocalFolders = () => section.value().folders;

export const isDefaultVKLocalFoldersSettings = section.isDefault;

/** Back to the defaults: every local folder is dropped. */
export const resetVKLocalFoldersSettings = section.reset;

/** Creates a folder and returns it (`undefined` when the name or the chats are not valid, or there are too many folders). */
export function createVKLocalFolder(title: string, peerIds: PeerId[]): VKLocalFolder | undefined {
  const cleaned = cleanTitle(title);
  const ids = cleanPeerIds(peerIds);
  if(!cleaned || !ids.length || vkLocalFolders().length >= MAX_FOLDERS) return undefined;

  const folder: VKLocalFolder = {id: createId(), title: cleaned, peerIds: ids};
  section.set({folders: [...vkLocalFolders(), folder]});
  return folder;
}

export function updateVKLocalFolder(id: string, patch: {title?: string, peerIds?: PeerId[]}) {
  section.set({
    folders: vkLocalFolders().map((folder) => {
      if(folder.id !== id) return folder;
      return {
        id,
        title: patch.title !== undefined ? (cleanTitle(patch.title) || folder.title) : folder.title,
        // an empty set would hide the folder from every section: the old chats stay
        peerIds: patch.peerIds?.length ? cleanPeerIds(patch.peerIds) : folder.peerIds
      };
    })
  });
}

export function removeVKLocalFolder(id: string) {
  const folders = vkLocalFolders().filter((folder) => folder.id !== id);
  // the last folder gone: nothing is left to keep, the section is dropped from the storage
  if(folders.length) section.set({folders});
  else section.reset();
}

/** One place up (`-1`) or down (`1`) in the user's order — the order the blocks show. */
export function moveVKLocalFolder(id: string, shift: -1 | 1) {
  const folders = [...vkLocalFolders()];
  const index = folders.findIndex((folder) => folder.id === id);
  const target = index + shift;
  if(index < 0 || target < 0 || target >= folders.length) return;

  [folders[index], folders[target]] = [folders[target], folders[index]];
  section.set({folders});
}

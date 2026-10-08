import {createVKConfigSection, isPlainObject} from '@/vkgram/config';

/**
 * The local folders of «Аудиозаписи» — a section («audio») of the VKgram config, so they are
 * exported and imported with the rest (see `vkgram/config.ts`). A folder is a name and a set of
 * chats / channels; its tab shows the music of those chats. They are NOT Telegram's chat
 * folders: nothing is written to the account, they exist in this browser (and in the config file).
 */
export type VKAudioFolder = {
  id: string,
  title: string,
  peerIds: PeerId[]
};

export type VKAudioSettings = {
  folders: VKAudioFolder[]
};

export const VK_AUDIO_FOLDER_TITLE_MAX = 40;
const MAX_FOLDERS = 30;
const MAX_PEERS = 200;

// never mutated: the section hands out copies of it
const DEFAULTS: VKAudioSettings = {folders: []};

const createId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const cleanTitle = (title: string) => title.trim().slice(0, VK_AUDIO_FOLDER_TITLE_MAX);

// peer ids are non-zero integers; anything else in the file is not a chat
const cleanPeerIds = (raw: unknown[]): PeerId[] => {
  const ids = raw.filter((value): value is number => Number.isSafeInteger(value) && value !== 0);
  return [...new Set(ids)].slice(0, MAX_PEERS) as PeerId[];
};

// a field of the wrong type is not a choice: the default decides; a broken folder is dropped, not the rest
const parse = (raw: unknown): VKAudioSettings | undefined => {
  if(!isPlainObject(raw)) return undefined;
  if(!Array.isArray(raw.folders)) return {folders: []};

  const folders: VKAudioFolder[] = [];
  const ids = new Set<string>();
  for(const item of raw.folders) {
    if(folders.length >= MAX_FOLDERS) break;
    if(!isPlainObject(item) || typeof item.title !== 'string' || !Array.isArray(item.peerIds)) continue;

    const title = cleanTitle(item.title);
    if(!title) continue;

    let id = typeof item.id === 'string' && /^[\w-]{1,40}$/.test(item.id) ? item.id : createId();
    if(ids.has(id)) id = createId();
    ids.add(id);

    folders.push({id, title, peerIds: cleanPeerIds(item.peerIds)});
  }
  return {folders};
};

// Before the config the chosen channels lived in their own key, as a bare list of peer ids:
// they become one folder, so nothing the user added is lost.
const parseLegacy = (raw: unknown): VKAudioSettings | undefined => {
  if(!Array.isArray(raw)) return undefined;
  const peerIds = cleanPeerIds(raw);
  return peerIds.length ? {folders: [{id: createId(), title: 'Каналы', peerIds}]} : undefined;
};

const section = createVKConfigSection<VKAudioSettings>({
  key: 'audio',
  title: 'Аудиозаписи',
  defaults: DEFAULTS,
  parse,
  legacy: {storageKey: 'vkgram_audio_channel_tabs', parse: parseLegacy}
});

export const vkAudioSettings = section.value;

export const vkAudioFolders = () => section.value().folders;

export const isDefaultVKAudioSettings = section.isDefault;

/** Back to the defaults: every local folder is dropped. */
export const resetVKAudioSettings = section.reset;

/** Creates a folder and returns it (`undefined` when the name or the chats are not valid, or there are too many folders). */
export function createVKAudioFolder(title: string, peerIds: PeerId[]): VKAudioFolder | undefined {
  const cleaned = cleanTitle(title);
  const ids = cleanPeerIds(peerIds);
  if(!cleaned || !ids.length || vkAudioFolders().length >= MAX_FOLDERS) return undefined;

  const folder: VKAudioFolder = {id: createId(), title: cleaned, peerIds: ids};
  section.set({folders: [...vkAudioFolders(), folder]});
  return folder;
}

export function updateVKAudioFolder(id: string, patch: {title?: string, peerIds?: PeerId[]}) {
  section.set({
    folders: vkAudioFolders().map((folder) => {
      if(folder.id !== id) return folder;
      return {
        id,
        title: patch.title !== undefined ? cleanTitle(patch.title) || folder.title : folder.title,
        peerIds: patch.peerIds ? cleanPeerIds(patch.peerIds) : folder.peerIds
      };
    })
  });
}

export function removeVKAudioFolder(id: string) {
  const folders = vkAudioFolders().filter((folder) => folder.id !== id);
  // the last folder gone: nothing is left to keep, the section is dropped from the storage
  if(folders.length) section.set({folders});
  else section.reset();
}

/** One place up (`-1`) or down (`1`) in the user's order — the order the tabs show. */
export function moveVKAudioFolder(id: string, shift: -1 | 1) {
  const folders = [...vkAudioFolders()];
  const index = folders.findIndex((folder) => folder.id === id);
  const target = index + shift;
  if(index < 0 || target < 0 || target >= folders.length) return;

  [folders[index], folders[target]] = [folders[target], folders[index]];
  section.set({folders});
}

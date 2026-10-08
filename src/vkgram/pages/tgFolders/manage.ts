import rootScope from '@lib/rootScope';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import type {ChannelFolder} from '@/vkgram/hooks/useChannelFolders';

/**
 * The management of Telegram's own chat folders — what the «Настроить папки»
 * panel of the «папки тг» blocks does. Unlike the local folders (the VKgram
 * config), these live in the user's account: their order and their very
 * existence are the same in every client of the user.
 */

export type TgSettingsFolder = {
  id: string,
  title: string,
  peerIds: PeerId[]
};

// the folder store of the panel: every folder of the account, in its order
export const toSettingsFolders = (folders: ChannelFolder[]): TgSettingsFolder[] =>
  folders.map((folder) => ({id: String(folder.id), title: folder.title, peerIds: [...folder.peerIds]}));

export const TG_FOLDERS_SETTINGS_NOTE = 'Это папки Telegram: они хранятся в вашем аккаунте и видны во всех ваших клиентах Telegram.';

/** The folder moves across its own kind: «Все» stays first, the archive keeps its place. */
export async function moveTgFolder(id: string, shift: -1 | 1) {
  try {
    const filters = await rootScope.managers.filtersStorage.getDialogFilters();
    const order = filters.map((filter) => filter.id);
    const index = order.indexOf(+id);
    const target = index + shift;
    if(index < 0 || target < 0 || target >= order.length) return;
    if(order[index] === FOLDER_ID_ALL || order[index] === FOLDER_ID_ARCHIVE) return;
    if(order[target] === FOLDER_ID_ALL || order[target] === FOLDER_ID_ARCHIVE) return;

    [order[index], order[target]] = [order[target], order[index]];
    await rootScope.managers.filtersStorage.updateDialogFiltersOrder(order);
  } catch(err) {
    console.error('VKgram: failed to reorder the folders', err);
  }
}

export async function removeTgFolder(id: string) {
  try {
    const filter = await rootScope.managers.filtersStorage.getFilter(+id);
    if(filter) await rootScope.managers.filtersStorage.updateDialogFilter(filter as any, true);
  } catch(err) {
    console.error('VKgram: failed to delete the folder', err);
  }
}

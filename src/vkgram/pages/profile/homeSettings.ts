import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import {createVKConfigSection, isPlainObject} from '@/vkgram/config';

/**
 * The wide blocks of «Моя страница» — a section («home») of the VKgram config, so they are
 * exported and imported with the rest (see `vkgram/config.ts`). They are local: nothing is
 * written to the Telegram account (the same as the local folders of «Аудиозаписи»).
 *
 * The user builds the page from blocks («Настройки» in the top bar) in the order they chose —
 * `blocks` is that order. There are two kinds of blocks:
 *
 *  - the blocks of the page itself (`system`: the information about the user, the music status,
 *    the personal channel, the gifts…): always there, they can be moved and hidden, not removed;
 *  - the blocks the user adds (`pinned`, `post`): any number of them, they can also be removed.
 *
 *  - `pinned` — «Закреплено»: the chats / channels the user pinned, in the order they chose;
 *  - `post` — «Пост канала»: which post of which channel the block shows:
 *      `latest` — the newest post of the channel, `pinned` — its pinned post,
 *      `post` — the post that was picked (`mids`: the messages of it, an album has several);
 *    `type` — what kind of content the post must have (a GIF, a photo, music…): «latest» is the
 *      newest post of that kind, and the choice of a post lists only the posts of that kind.
 */
export type VKHomePostMode = 'latest' | 'pinned' | 'post';

export type VKHomeContentType = 'any' | 'photo' | 'video' | 'gif' | 'music' | 'voice' | 'document' | 'link';

// `filter` is Telegram's own search filter (the one the «Shared media» tabs of Web K run)
// Telegram has the GIF filter (`inputMessagesFilterGif`), Web K's own list of filters does not name it
const GIF_FILTER = 'inputMessagesFilterGif' as unknown as MyInputMessagesFilter;

export const VK_HOME_CONTENT_TYPES: {id: VKHomeContentType, title: string, filter?: MyInputMessagesFilter}[] = [
  {id: 'any', title: 'Любой'},
  {id: 'photo', title: 'Фото', filter: 'inputMessagesFilterPhotos'},
  {id: 'video', title: 'Видео', filter: 'inputMessagesFilterVideo'},
  {id: 'gif', title: 'GIF', filter: GIF_FILTER},
  {id: 'music', title: 'Музыка', filter: 'inputMessagesFilterMusic'},
  {id: 'voice', title: 'Голосовые', filter: 'inputMessagesFilterVoice'},
  {id: 'document', title: 'Файлы', filter: 'inputMessagesFilterDocument'},
  {id: 'link', title: 'Ссылки', filter: 'inputMessagesFilterUrl'}
];

export const getVKHomeContentType = (type: VKHomeContentType) => {
  return VK_HOME_CONTENT_TYPES.find((item) => item.id === type) ?? VK_HOME_CONTENT_TYPES[0];
};

export type VKHomePost = {
  peerId: PeerId,
  mode: VKHomePostMode,
  type: VKHomeContentType,
  mids: number[]
};

// the blocks of the page itself, in the order the page has them by default
export const VK_HOME_SYSTEM_BLOCKS = [
  {id: 'info', title: 'Информация о пользователе'},
  {id: 'music', title: 'Музыкальный статус'},
  {id: 'channel', title: 'Личный канал'},
  {id: 'stories', title: 'Публикации'},
  {id: 'gifts', title: 'Подарки'}
] as const;

export type VKHomeSystemId = typeof VK_HOME_SYSTEM_BLOCKS[number]['id'];

/** The kinds of blocks the user can add. */
export type VKHomeBlockKind = 'pinned' | 'post';

export type VKHomeSystemBlock = {id: VKHomeSystemId, kind: 'system', hidden: boolean};

export type VKHomePinnedBlock = {id: string, kind: 'pinned', peerIds: PeerId[]};

// `post` is `null` until a post is chosen: the block then offers to choose one
export type VKHomePostBlock = {id: string, kind: 'post', post: VKHomePost | null};

export type VKHomeBlock = VKHomeSystemBlock | VKHomePinnedBlock | VKHomePostBlock;

export type VKHomeSettings = {
  blocks: VKHomeBlock[],
  // only how the block «Информация о пользователе» of my page looks: the data itself is not touched
  hidePhone: boolean,
  hideUsername: boolean
};

export const VK_HOME_MAX_PINNED = 30;
// the blocks the user adds (the blocks of the page itself are not counted)
export const VK_HOME_MAX_BLOCKS = 20;
// an album holds at most ten messages
const MAX_MIDS = 10;
// the id ends up in the ids of the page's elements
const ID_PATTERN = /^[\w-]{1,40}$/;

// never mutated: the section hands out copies of it
const DEFAULT_BLOCKS: VKHomeBlock[] = VK_HOME_SYSTEM_BLOCKS.map(({id}) => ({id, kind: 'system', hidden: false}));
const DEFAULTS: VKHomeSettings = {blocks: DEFAULT_BLOCKS, hidePhone: false, hideUsername: false};

const isSystemId = (value: unknown): value is VKHomeSystemId => {
  return VK_HOME_SYSTEM_BLOCKS.some((item) => item.id === value);
};

// peer ids are non-zero integers; anything else in the file is not a chat
const isPeerId = (value: unknown): value is number => Number.isSafeInteger(value) && value !== 0;

const cleanPeerIds = (raw: unknown[]): PeerId[] => {
  return [...new Set(raw.filter(isPeerId))].slice(0, VK_HOME_MAX_PINNED) as PeerId[];
};

const parsePost = (raw: unknown): VKHomePost | null => {
  if(!isPlainObject(raw) || !isPeerId(raw.peerId)) return null;
  if(raw.mode !== 'latest' && raw.mode !== 'pinned' && raw.mode !== 'post') return null;

  const mids = Array.isArray(raw.mids) ?
    [...new Set(raw.mids.filter((mid): mid is number => Number.isSafeInteger(mid) && mid > 0))].slice(0, MAX_MIDS) :
    [];
  // a chosen post without a post is nothing to show
  if(raw.mode === 'post' && !mids.length) return null;

  // a setting saved before the types existed has none: any post
  const type = VK_HOME_CONTENT_TYPES.some((item) => item.id === raw.type) ? raw.type as VKHomeContentType : 'any';

  return {peerId: raw.peerId as PeerId, mode: raw.mode, type, mids: raw.mode === 'post' ? mids : []};
};

const createId = (taken: Set<string>) => {
  let id: string;
  do {
    id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  } while(taken.has(id));
  return id;
};

const parseBlocks = (raw: unknown[]): VKHomeBlock[] => {
  const ids = new Set<string>();
  const blocks: VKHomeBlock[] = [];
  let added = 0;

  for(const item of raw) {
    if(!isPlainObject(item)) continue;

    if(item.kind === 'system') {
      // one of each, and only those the page has
      if(!isSystemId(item.id) || ids.has(item.id)) continue;
      ids.add(item.id);
      blocks.push({id: item.id, kind: 'system', hidden: item.hidden === true});
      continue;
    }

    if((item.kind !== 'pinned' && item.kind !== 'post') || added >= VK_HOME_MAX_BLOCKS) continue;
    added++;

    // an id that is missing, odd, already taken or the id of a block of the page is replaced
    const id = typeof item.id === 'string' && ID_PATTERN.test(item.id) && !ids.has(item.id) && !isSystemId(item.id) ?
      item.id :
      createId(ids);
    ids.add(id);

    blocks.push(item.kind === 'pinned' ?
      {id, kind: 'pinned', peerIds: Array.isArray(item.peerIds) ? cleanPeerIds(item.peerIds) : []} :
      {id, kind: 'post', post: parsePost(item.post)});
  }

  // a list saved before the blocks of the page were in it: the blocks the user added stood under the
  // information about the user, before the rest
  if(!blocks.some((block) => block.kind === 'system')) {
    const [info, ...rest] = DEFAULT_BLOCKS;
    return [info, ...blocks, ...rest];
  }

  return withSystemBlocks(blocks);
};

// a block of the page that the saved list lacks (it was not there yet) comes back after the one before it
const withSystemBlocks = (blocks: VKHomeBlock[]): VKHomeBlock[] => {
  const result = [...blocks];

  for(const {id} of VK_HOME_SYSTEM_BLOCKS) {
    if(result.some((block) => block.id === id)) continue;

    const index = VK_HOME_SYSTEM_BLOCKS.findIndex((item) => item.id === id);
    const before = VK_HOME_SYSTEM_BLOCKS.slice(0, index).map((item) => item.id as string);
    const last = result.reduce((found, block, position) => before.includes(block.id) ? position : found, -1);
    result.splice(last + 1, 0, {id, kind: 'system', hidden: false});
  }

  return result;
};

// the shape before the blocks existed: one list of pinned chats and one post, each shown when it was set
const parseLegacy = (raw: {[key: string]: unknown}): VKHomeBlock[] => {
  const added: unknown[] = [];
  const peerIds = Array.isArray(raw.pinned) ? cleanPeerIds(raw.pinned) : [];
  if(peerIds.length) added.push({id: 'pinned', kind: 'pinned', peerIds});
  if(parsePost(raw.post)) added.push({id: 'post', kind: 'post', post: raw.post});
  return parseBlocks(added);
};

// a field of the wrong type is not a choice: the default decides
const parse = (raw: unknown): VKHomeSettings | undefined => {
  if(!isPlainObject(raw)) return undefined;
  return {
    blocks: Array.isArray(raw.blocks) ? parseBlocks(raw.blocks) : parseLegacy(raw),
    hidePhone: raw.hidePhone === true,
    hideUsername: raw.hideUsername === true
  };
};

const section = createVKConfigSection<VKHomeSettings>({
  key: 'home',
  title: 'Главная страница',
  defaults: DEFAULTS,
  parse
});

export const vkHomeSettings = section.value;

export const vkHomeBlocks = () => section.value().blocks;

/** «Скрыть номер телефона»: the phone is not drawn in the information about me. */
export const vkHomeHidePhone = () => section.value().hidePhone;

/** «Скрыть никнейм»: the username is not drawn in the information about me. */
export const vkHomeHideUsername = () => section.value().hideUsername;

// the ids alone: the page keeps a block as it is while the others change or move
export const vkHomeBlockIds = () => vkHomeBlocks().map((block) => block.id);

export const getVKHomeBlock = (id: string) => vkHomeBlocks().find((block) => block.id === id);

/** The chats of a «Закреплено» block. */
export const vkHomePinned = (id: string): PeerId[] => {
  const block = getVKHomeBlock(id);
  return block?.kind === 'pinned' ? block.peerIds : [];
};

/** A block of the page itself (not one the user added); `undefined` for any other id. */
export const getVKHomeSystem = (id: string): VKHomeSystemBlock | undefined => {
  const block = getVKHomeBlock(id);
  return block?.kind === 'system' ? block : undefined;
};

/** The blocks the user added are limited in number. */
export const isVKHomeBlocksFull = () => {
  return vkHomeBlocks().filter((block) => block.kind !== 'system').length >= VK_HOME_MAX_BLOCKS;
};

/** The post of a «Пост канала» block; `null` while none is chosen. */
export const vkHomePost = (id: string): VKHomePost | null => {
  const block = getVKHomeBlock(id);
  return block?.kind === 'post' ? block.post : null;
};

export const isDefaultVKHomeSettings = section.isDefault;

/** Back to the defaults: the blocks of the page in their places, all shown, none added. */
export const resetVKHomeSettings = section.reset;

// nothing left to keep: the section is dropped from the storage
function save(blocks: VKHomeBlock[], flags: Pick<VKHomeSettings, 'hidePhone' | 'hideUsername'> = section.value()) {
  const isDefault = blocks.length === DEFAULT_BLOCKS.length &&
    blocks.every((block, index) => block.kind === 'system' && !block.hidden && block.id === DEFAULT_BLOCKS[index].id) &&
    !flags.hidePhone && !flags.hideUsername;
  if(isDefault) section.reset();
  else section.set({blocks, hidePhone: flags.hidePhone, hideUsername: flags.hideUsername});
}

// one block changes, the others (and so what the page shows of them) stay as they are
function updateBlock(id: string, update: (block: VKHomeBlock) => VKHomeBlock) {
  save(vkHomeBlocks().map((block) => block.id === id ? update(block) : block));
}

/** A new empty block at the end of the page; `undefined` when there are too many of them. */
export function addVKHomeBlock(kind: VKHomeBlockKind): string | undefined {
  const blocks = vkHomeBlocks();
  if(isVKHomeBlocksFull()) return;

  const id = createId(new Set(blocks.map((block) => block.id)));
  save([...blocks, kind === 'pinned' ? {id, kind, peerIds: []} : {id, kind, post: null}]);
  return id;
}

/** Takes away a block the user added; the blocks of the page itself cannot be removed, only hidden. */
export function removeVKHomeBlock(id: string) {
  save(vkHomeBlocks().filter((block) => block.id !== id || block.kind === 'system'));
}

/** Hides a block of the page itself (it keeps its place in the list) or shows it again. */
export function setVKHomeBlockHidden(id: string, hidden: boolean) {
  updateBlock(id, (block) => block.kind === 'system' ? {...block, hidden} : block);
}

/** One place up (`-1`) or down (`1`) the page. */
export function moveVKHomeBlock(id: string, shift: -1 | 1) {
  const blocks = [...vkHomeBlocks()];
  const index = blocks.findIndex((block) => block.id === id);
  const target = index + shift;
  if(index < 0 || target < 0 || target >= blocks.length) return;

  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  save(blocks);
}

/** The pinned chats of a block, in the given order. */
export function setVKHomePinned(id: string, peerIds: PeerId[]) {
  updateBlock(id, (block) => block.kind === 'pinned' ? {...block, peerIds: cleanPeerIds(peerIds)} : block);
}

/** The post a block shows; `null` clears it. */
export function setVKHomePost(id: string, post: VKHomePost | null) {
  updateBlock(id, (block) => block.kind === 'post' ? {...block, post: parsePost(post)} : block);
}

/** Switches «Скрыть номер телефона» / «Скрыть никнейм» of the block «Информация о пользователе». */
export function setVKHomeInfoHidden(field: 'hidePhone' | 'hideUsername', hidden: boolean) {
  save(vkHomeBlocks(), {...section.value(), [field]: hidden});
}

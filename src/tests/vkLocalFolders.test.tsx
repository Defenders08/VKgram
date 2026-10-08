import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import VKLocalFolders from '@/vkgram/components/VKLocalFolders';
import {
  createVKLocalFolder,
  moveVKLocalFolder,
  removeVKLocalFolder,
  resetVKLocalFoldersSettings,
  updateVKLocalFolder,
  vkLocalFolders,
  type VKLocalFolder
} from '@/vkgram/pages/localFolders/settings';

vi.mock('@lib/rootScope', () => ({
  default: {myId: 1, managers: {}, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => ({})
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

// Web K's own dialog (it reads the dialogs storage): the picker itself is out of scope here
vi.mock('@/vkgram/components/VKChatsPickerModal', () => ({
  default: () => <div class="vk-picker-mock" />
}));

// the real one mounts Web K's popup stack; the title and the children are all the tests need
vi.mock('@/vkgram/components/VKModal', () => ({
  default: (props: {title: string, children: JSX.Element}) => (
    <div class="vk-modal-mock" data-title={props.title}>{props.children}</div>
  )
}));

// jsdom has no Web Animations API: the moves happen, the animations do not
vi.mock('@/vkgram/utils/animate', () => ({
  animateIn: vi.fn(),
  animateOut: vi.fn(async() => {}),
  animateMove: (_query: unknown, mutate: () => void) => mutate(),
  flash: vi.fn(),
  flyFromRect: vi.fn()
}));

const dispose: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  resetVKLocalFoldersSettings();
});
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
});

const mount = (props: Parameters<typeof VKLocalFolders>[0]) => {
  dispose.push(render(() => <VKLocalFolders {...props} />, document.body));
  return document.body;
};

const folder = (title: string, peerIds: number[]): VKLocalFolder => createVKLocalFolder(title, peerIds as PeerId[])!;

const saveButton = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('.vk-modal-foot .vk-button:not(.vk-button-secondary)')!;

describe('local folders settings', () => {
  it('creates a folder with a cleaned title and deduplicated peer ids', () => {
    const created = createVKLocalFolder('  Друзья  ', [1, -2, 1, 3] as PeerId[]);
    expect(created?.title).toBe('Друзья');
    expect(created?.peerIds).toEqual([1, -2, 3]);
    expect(vkLocalFolders()).toHaveLength(1);
  });

  it('refuses a folder without a title, without chats, or over the limit', () => {
    expect(createVKLocalFolder('   ', [1] as PeerId[])).toBeUndefined();
    expect(createVKLocalFolder('Пустая', [] as PeerId[])).toBeUndefined();

    for(let i = 0; i < 30; ++i) expect(createVKLocalFolder(`Папка ${i}`, [i + 1] as PeerId[])).toBeTruthy();
    expect(createVKLocalFolder('Ещё одна', [99] as PeerId[])).toBeUndefined();
    expect(vkLocalFolders()).toHaveLength(30);
  });

  it('updates title and chats, keeping the folder whole', () => {
    const created = folder('Старое', [1, 2]);
    updateVKLocalFolder(created.id, {title: 'Новое', peerIds: [2, 3]});

    const [updated] = vkLocalFolders();
    expect(updated.title).toBe('Новое');
    expect(updated.peerIds).toEqual([2, 3]);

    // an empty set would hide the folder from every section: the old chats stay
    updateVKLocalFolder(created.id, {peerIds: []});
    expect(vkLocalFolders()[0].peerIds).toEqual([2, 3]);

    // a blank title is not a name: the old one stays
    updateVKLocalFolder(created.id, {title: '   '});
    expect(vkLocalFolders()[0].title).toBe('Новое');
  });

  it('moves a folder up and down the user order', () => {
    const a = folder('А', [1]);
    const b = folder('Б', [2]);
    moveVKLocalFolder(b.id, -1);
    expect(vkLocalFolders().map((f) => f.id)).toEqual([b.id, a.id]);

    moveVKLocalFolder(b.id, 1);
    expect(vkLocalFolders().map((f) => f.id)).toEqual([a.id, b.id]);

    // the edges do nothing
    moveVKLocalFolder(a.id, -1);
    moveVKLocalFolder(b.id, 1);
    expect(vkLocalFolders().map((f) => f.id)).toEqual([a.id, b.id]);
  });

  it('removes a folder and drops the whole section with the last one', () => {
    const a = folder('А', [1]);
    const b = folder('Б', [2]);
    removeVKLocalFolder(a.id);
    expect(vkLocalFolders().map((f) => f.title)).toEqual(['Б']);

    removeVKLocalFolder(b.id);
    expect(vkLocalFolders()).toEqual([]);
    expect(localStorage.getItem('vkgram-config')).toBeNull();
  });
});

describe('local folders config parsing', () => {
  it('reads the saved section and drops broken folders, not the rest', async() => {
    vi.resetModules();
    localStorage.setItem('vkgram-config', JSON.stringify({
      v: 1,
      sections: {
        localFolders: {
          folders: [
            {id: 'a', title: 'Друзья', peerIds: [1, -2, 1, 'x', 0]},
            {title: 'Без id', peerIds: [3]},
            {id: 'c', title: '   ', peerIds: [4]},
            {id: 'd', title: 'Пустая', peerIds: []},
            'мусор'
          ]
        }
      }
    }));

    const settings = await import('@/vkgram/pages/localFolders/settings');
    const folders = settings.vkLocalFolders();
    expect(folders.map((f) => ({id: f.id, title: f.title, peerIds: f.peerIds}))).toEqual([
      {id: 'a', title: 'Друзья', peerIds: [1, -2]},
      // a missing id is made up, the folder is not lost
      {id: expect.any(String), title: 'Без id', peerIds: [3]}
    ]);
  });
});

describe('VKLocalFolders block', () => {
  it('shows the folder tabs and marks the open one', () => {
    const a = folder('Друзья', [1]);
    folder('Каналы', [-2]);

    const onToggle = vi.fn();
    const root = mount({folders: vkLocalFolders(), activeId: a.id, onToggle, idPrefix: 'vk-test', section: 'messages'});

    const tabs = [...root.querySelectorAll<HTMLElement>('.vk-tab:not(.vk-tab-add)')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Друзья', 'Каналы']);
    expect(tabs[0].classList.contains('is-active')).toBe(true);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');

    tabs[1].click();
    expect(onToggle).toHaveBeenCalledWith(vkLocalFolders()[1].id);
  });

  it('invites to create the first folder when the section has none', () => {
    folder('Работа', [1]);

    const root = mount({folders: [], onToggle: vi.fn(), idPrefix: 'vk-test', section: 'messages'});
    expect(root.querySelector('.vk-media-group-empty-title')?.textContent).toBe('Добавьте локальные папки');
    // the card speaks of what this section collects: «чаты» in «Сообщениях»
    expect(root.querySelector('.vk-media-group-empty-text')?.textContent).toContain('чаты');
    expect(root.querySelector('.vk-media-group-empty-text')?.textContent).toContain('хранятся только в VKgram');

    (root.querySelector('.vk-media-group-empty-button') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Новая папка');
  });

  it('the invitation text names the things of its own section', () => {
    const words: {[section: string]: string} = {
      messages: 'чаты',
      friends: 'друзей',
      channels: 'каналы',
      news: 'ленте'
    };
    for(const [section, word] of Object.entries(words)) {
      const root = mount({folders: [], onToggle: vi.fn(), idPrefix: 'vk-test', section: section as 'messages'});
      expect(root.querySelector('.vk-media-group-empty-text')?.textContent).toContain(word);
      // the next section mounts into the same body: take this one down first
      dispose.pop()?.();
    }
  });

  it('opens a new-folder dialog on «+» and the folder itself from the settings panel', () => {
    folder('Друзья', [1]);

    const root = mount({folders: vkLocalFolders(), onToggle: vi.fn(), idPrefix: 'vk-test', section: 'messages'});
    expect(root.querySelector('.vk-modal-mock')).toBeNull();

    (root.querySelector('.vk-tab-add') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Новая папка');

    (root.querySelector('.vk-news-settings-button') as HTMLButtonElement).click();
    const panel = root.querySelector('.vk-folders-settings')!;
    expect(panel.querySelector('.vk-news-settings-title')?.textContent).toBe('Настройка папок');

    (panel.querySelector('.vk-header-settings-icon') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Папка');
    expect((root.querySelector('.vk-folder-name input') as HTMLInputElement).value).toBe('Друзья');
  });

  it('saves the edited folder and picks it, the modal closes', () => {
    const created = folder('Друзья', [1]);
    const onSelect = vi.fn();

    const root = mount({folders: vkLocalFolders(), onToggle: vi.fn(), onSelect, idPrefix: 'vk-test', section: 'messages'});
    (root.querySelector('.vk-news-settings-button') as HTMLButtonElement).click();
    (root.querySelector('.vk-folders-settings .vk-header-settings-icon') as HTMLButtonElement).click();

    const input = root.querySelector('.vk-folder-name input') as HTMLInputElement;
    input.value = 'Близкие';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    saveButton(root).click();

    expect(vkLocalFolders()[0].title).toBe('Близкие');
    expect(onSelect).toHaveBeenCalledWith(created.id);
    expect(root.querySelector('.vk-modal-mock')).toBeNull();
  });

  it('the settings panel lists every folder, even the ones this section hides', () => {
    const visible = folder('Друзья', [1]);
    folder('Только каналы', [-2]);

    const root = mount({folders: [visible], onToggle: vi.fn(), idPrefix: 'vk-test', section: 'messages'});
    (root.querySelector('.vk-news-settings-button') as HTMLButtonElement).click();

    const titles = [...root.querySelectorAll('.vk-folders-settings .vk-header-settings-block-title')];
    expect(titles.map((el) => el.textContent)).toEqual(['Друзья', 'Только каналы']);
    expect(root.querySelector('.vk-folders-settings .vk-header-settings-block-info .vk-page-text-secondary')?.textContent)
      .toBe('1 чат');
  });

  it('moves folders with the arrows of the panel', () => {
    const a = folder('А', [1]);
    const b = folder('Б', [2]);

    const root = mount({folders: vkLocalFolders(), onToggle: vi.fn(), idPrefix: 'vk-test', section: 'messages'});
    (root.querySelector('.vk-news-settings-button') as HTMLButtonElement).click();
    const panel = root.querySelector('.vk-folders-settings')!;
    const rowButtons = (row: Element) => [...row.querySelectorAll<HTMLButtonElement>('.vk-header-settings-icon')];

    // the first row: «выше» is disabled, «ниже» swaps the two
    const [firstRow, secondRow] = [...panel.querySelectorAll('.vk-header-settings-block')];
    expect(rowButtons(firstRow)[1].disabled).toBe(true);
    rowButtons(firstRow)[2].click();
    expect(vkLocalFolders().map((f) => f.id)).toEqual([b.id, a.id]);
    expect(rowButtons(secondRow)[1].disabled).toBe(true);
  });

  it('deletes from the panel after the confirm step', async() => {
    folder('Друзья', [1]);

    const root = mount({folders: vkLocalFolders(), onToggle: vi.fn(), idPrefix: 'vk-test', section: 'messages'});
    (root.querySelector('.vk-news-settings-button') as HTMLButtonElement).click();
    const panel = root.querySelector('.vk-folders-settings')!;
    const removeButton = () => panel.querySelector<HTMLButtonElement>('.vk-header-settings-icon:last-of-type')!;

    removeButton().click();
    expect(vkLocalFolders()).toHaveLength(1);
    expect(panel.querySelector('.vk-folders-remove-confirm')?.textContent).toBe('Точно удалить?');

    (panel.querySelector('.vk-folders-remove-confirm') as HTMLButtonElement).click();
    // the row folds up before it is taken out: the removal lands a microtask later
    await Promise.resolve();
    expect(vkLocalFolders()).toEqual([]);
  });

  it('refuses to save without a name, the error is shown', () => {
    folder('Друзья', [1]);

    const root = mount({folders: vkLocalFolders(), onToggle: vi.fn(), idPrefix: 'vk-test', section: 'messages'});
    (root.querySelector('.vk-news-settings-button') as HTMLButtonElement).click();
    (root.querySelector('.vk-folders-settings .vk-header-settings-icon') as HTMLButtonElement).click();

    const input = root.querySelector('.vk-folder-name input') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new Event('input', {bubbles: true}));
    saveButton(root).click();

    expect(root.querySelector('.vk-folder-note[role="alert"]')?.textContent).toBe('Введите название папки.');
    expect(vkLocalFolders()[0].title).toBe('Друзья');
  });
});

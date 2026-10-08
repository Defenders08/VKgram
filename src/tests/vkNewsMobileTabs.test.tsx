import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import VKTabs from '@/vkgram/components/VKTabs';
import VKFolderAddModal from '@/vkgram/components/VKFolderAddModal';
import VKNewsCustomizeModal from '@/vkgram/pages/news/VKNewsCustomizeModal';
import VKPageNews from '@/vkgram/pages/VKPageNews';
import useNewsCustomize, {setNewsCustomizeOpen} from '@/vkgram/pages/news/customize';
import {createVKLocalFolder, resetVKLocalFoldersSettings, vkLocalFolders} from '@/vkgram/pages/localFolders/settings';

vi.hoisted(() => {
  // jsdom has no IntersectionObserver: the feed's sentinel arms one on mount
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  (globalThis as any).IntersectionObserver = IntersectionObserverStub;
});

vi.mock('@lib/rootScope', () => ({
  default: {myId: 1, managers: {}, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => ({})
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

// the picker itself is out of scope: «Добавить чаты» is answered with one chat
vi.mock('@/vkgram/components/VKChatsPickerModal', () => ({
  default: (props: {onDone: (ids: PeerId[]) => void}) => (
    <button type="button" class="vk-picker-mock-done" onClick={() => props.onDone([101 as PeerId])} />
  )
}));

// the real one mounts Web K's popup stack; the title and the children are all the tests need
vi.mock('@/vkgram/components/VKModal', () => ({
  default: (props: {title: string, children: JSX.Element}) => (
    <div class="vk-modal-mock" data-title={props.title}>{props.children}</div>
  )
}));

// the Telegram folder form needs Web K's input fields and the filters storage: the «Папка
// Telegram» tab of the combined window is covered by its own mock here
vi.mock('@/vkgram/components/VKFolderCreateModal', () => ({
  default: () => <div class="vk-folder-create-mock" />,
  VKFolderCreateForm: () => <div class="vk-folder-create-mock" />
}));

// jsdom has no Web Animations API: the moves happen, the animations do not
vi.mock('@/vkgram/utils/animate', () => ({
  animateIn: vi.fn(),
  animateOut: vi.fn(async() => {}),
  animateMove: (_query: unknown, mutate: () => void) => mutate(),
  flash: vi.fn(),
  flyFromRect: vi.fn()
}));

// the page's neighbours are out of scope here
vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  default: () => ({
    isReady: () => true,
    channels: () => [{peerId: -300 as PeerId}, {peerId: -301 as PeerId}]
  })
}));

vi.mock('@/vkgram/hooks/useChannelFolders', () => ({
  default: () => ({
    isReady: () => true,
    folders: () => [{id: 2, title: 'Кино', peerIds: [-300 as PeerId]}]
  })
}));

const feed = (): Record<string, any> => ({
  isReady: () => true,
  isLoading: () => false,
  isLoadingMore: () => false,
  isEnd: () => false,
  loadMore: vi.fn(),
  retry: vi.fn(),
  failedCount: () => 0,
  postKeys: (): any[] => [],
  getPost: (): any => undefined,
  totalChannelCount: () => 2,
  channelCount: () => 2,
  scopeChannelCount: () => 2,
  scopeStats: () => ({archived: 0, muted: 0})
});

vi.mock('@/vkgram/hooks/createNewsFeed', () => ({
  default: (_props: unknown) => feed()
}));

vi.mock('@/vkgram/pages/news/VKNewsStories', () => ({
  default: () => <div class="vk-stories-mock" />
}));

vi.mock('@/vkgram/pages/news/VKNewsNotifications', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/pages/channel/VKChannelPost', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/sections', () => ({
  openVKSection: vi.fn()
}));

const dispose: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  resetVKLocalFoldersSettings();
});
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  setNewsCustomizeOpen(false);
});

const mount = (jsx: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

const fillAndPick = (root: HTMLElement, title: string) => {
  // the chats first: the form refuses to save without them
  (root.querySelector('.vk-folder-add') as HTMLButtonElement).click();
  (root.querySelector('.vk-picker-mock-done') as HTMLButtonElement).click();
  const input = root.querySelector<HTMLInputElement>('.vk-folder-name input')!;
  input.value = title;
  input.dispatchEvent(new Event('input', {bubbles: true}));
};

// the innermost dialog: the folder dialog opens over the window that called it
const topModal = (root: HTMLElement) => {
  const dialogs = root.querySelectorAll('.vk-modal-mock');
  return dialogs[dialogs.length - 1] as HTMLElement;
};

const saveButton = (root: HTMLElement) =>
  topModal(root).querySelector<HTMLButtonElement>('.vk-modal-foot .vk-button:not(.vk-button-secondary)')!;

describe('VKTabs with addPinned', () => {
  it('pins «+» at the right end of the strip instead of after the last tab', () => {
    const onAdd = vi.fn();
    const root = mount(() => (
      <VKTabs
        tabs={[{id: 'a', title: 'Все'}, {id: 'b', title: 'Кино'}]}
        active="a"
        onChange={vi.fn()}
        idPrefix="vk-test"
        addLabel="Создать папку"
        addPinned
        onAdd={onAdd}
      />
    ));

    expect(root.querySelector('.vk-tab-add')).toBeNull();
    const add = root.querySelector<HTMLButtonElement>('.vk-tabs-actions .vk-tabs-add')!;
    expect(add.getAttribute('aria-label')).toBe('Создать папку');
    add.click();
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('keeps the inline «+» when addPinned is off', () => {
    const root = mount(() => (
      <VKTabs
        tabs={[{id: 'a', title: 'Все'}]}
        active="a"
        onChange={vi.fn()}
        idPrefix="vk-test"
        addLabel="Создать папку"
        onAdd={vi.fn()}
      />
    ));

    expect(root.querySelector('.vk-tab-add')).toBeTruthy();
    expect(root.querySelector('.vk-tabs-actions')).toBeNull();
  });
});

describe('VKFolderAddModal', () => {
  it('opens on the local folder form and switches to the Telegram one', () => {
    const onClose = vi.fn();
    const root = mount(() => (
      <VKFolderAddModal onClose={onClose} />
    ));

    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Новая папка');
    expect(root.querySelector('.vk-folder-name input')).toBeTruthy();

    const kindTabs = [...root.querySelectorAll<HTMLButtonElement>('.vk-folder-add-tabs .vk-tab')];
    expect(kindTabs.map((tab) => tab.textContent)).toEqual(['Локальная папка', 'Папка Telegram']);
    kindTabs[1].click();
    expect(root.querySelector('.vk-folder-create-mock')).toBeTruthy();
    expect(root.querySelector('.vk-folder-name input')).toBeNull();
  });

  it('creates a local folder, picks it and closes the window', () => {
    const onClose = vi.fn();
    const onCreatedLocal = vi.fn();
    const root = mount(() => (
      <VKFolderAddModal onClose={onClose} onCreatedLocal={onCreatedLocal} />
    ));

    fillAndPick(root, 'Мои');
    saveButton(root).click();

    expect(vkLocalFolders()[0]?.title).toBe('Мои');
    expect(onCreatedLocal).toHaveBeenCalledWith(vkLocalFolders()[0].id);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('VKNewsCustomizeModal', () => {
  it('holds the feed settings and the folder settings in one window', () => {
    createVKLocalFolder('Друзья', [101] as PeerId[]);
    const root = mount(() => (
      <VKNewsCustomizeModal onClose={vi.fn()} channelCount={2} scopeCount={2} />
    ));

    const titles = [...root.querySelectorAll('.vk-news-customize-section .vk-news-settings-title')];
    expect(titles.map((title) => title.textContent)).toEqual(['Настройки ленты', 'Настройка папок']);
    // the feed settings are the real panel: the filters and the reset are there
    expect(root.querySelector('.vk-news-settings-legend')?.textContent).toBe('Фильтры:');
    // the folders panel lists the local folder
    expect(root.querySelector('.vk-header-settings-block-title')?.textContent).toBe('Друзья');
  });

  it('creates a local folder from the panel and picks it in the feed', () => {
    const onSelectFolder = vi.fn();
    const root = mount(() => (
      <VKNewsCustomizeModal onClose={vi.fn()} onSelectFolder={onSelectFolder} />
    ));

    (root.querySelectorAll('.vk-news-settings-head .vk-link-button')[1] as HTMLButtonElement).click();
    expect(topModal(root).getAttribute('data-title')).toBe('Новая папка');

    fillAndPick(root, 'Мои');
    saveButton(root).click();

    expect(onSelectFolder).toHaveBeenCalledWith(vkLocalFolders()[0].id);
  });
});

describe('mobile tabs of «Новости»', () => {
  it('the server folders and the local ones are one strip with a pinned «+»', () => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    createVKLocalFolder('Мои', [-301] as PeerId[]);

    const root = mount(() => <VKPageNews />);

    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.vk-news-mobile-tabs .vk-tab')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Все', 'Кино', 'Мои']);
    // no tab wraps to a second strip: the local block of the desktop is not on a phone
    expect(root.querySelectorAll('.vk-news-mobile-tabs .vk-folders-block')).toHaveLength(0);
    // the settings of the side rail are not next to the tabs on a phone
    expect(root.querySelector('.vk-news-mobile-tabs .vk-news-settings-button')).toBeNull();
    // «+» is pinned at the right end, not inline after the last tab
    expect(root.querySelector('.vk-news-mobile-tabs .vk-tab-add')).toBeNull();
    const add = root.querySelector<HTMLButtonElement>('.vk-news-mobile-tabs .vk-tabs-add')!;
    expect(add.getAttribute('aria-label')).toBe('Создать папку');

    // a local folder is picked and put down like a server one
    tabs[2].click();
    expect(tabs[2].classList.contains('is-active')).toBe(true);
    expect(tabs[0].classList.contains('is-active')).toBe(false);
    tabs[0].click();
    expect(tabs[0].classList.contains('is-active')).toBe(true);
    expect(tabs[2].classList.contains('is-active')).toBe(false);
  });

  it('the pinned «+» opens both kinds of folders in one window', () => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    const root = mount(() => <VKPageNews />);

    (root.querySelector('.vk-news-mobile-tabs .vk-tabs-add') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Новая папка');
    expect([...root.querySelectorAll('.vk-folder-add-tabs .vk-tab')].map((tab) => tab.textContent))
      .toEqual(['Локальная папка', 'Папка Telegram']);
  });

  it('the settings live in the «Настроить» window, opened from anywhere', () => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    const root = mount(() => <VKPageNews />);

    // the icon of the mobile top bar opens the very window the page hosts
    setNewsCustomizeOpen(true);
    const customize = root.querySelector('.vk-modal-mock[data-title="Настроить"]')!;
    expect(customize).toBeTruthy();
    expect([...customize.querySelectorAll('.vk-news-settings-title')].map((title) => title.textContent))
      .toEqual(['Настройки ленты', 'Настройка папок']);

    (customize.querySelector('.vk-modal-foot .vk-button') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock[data-title="Настроить"]')).toBeNull();
  });
});

describe('useNewsCustomize', () => {
  it('starts closed and shares one signal', () => {
    const [isOpen] = useNewsCustomize();
    expect(isOpen()).toBe(false);
    setNewsCustomizeOpen(true);
    expect(isOpen()).toBe(true);
  });
});

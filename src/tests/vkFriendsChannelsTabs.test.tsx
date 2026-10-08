import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import VKPageFriends from '@/vkgram/pages/VKPageFriends';
import VKPageChannels from '@/vkgram/pages/VKPageChannels';
import VKFoldersCustomizeModal from '@/vkgram/components/VKFoldersCustomizeModal';
import useFriendsCustomize, {setFriendsCustomizeOpen} from '@/vkgram/pages/friends/customize';
import useChannelsCustomize, {setChannelsCustomizeOpen} from '@/vkgram/pages/channels/customize';
import {createVKLocalFolder, resetVKLocalFoldersSettings, vkLocalFolders} from '@/vkgram/pages/localFolders/settings';
import type {Dialog} from '@appManagers/appMessagesManager';

vi.hoisted(() => {
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  (globalThis as any).IntersectionObserver = IntersectionObserverStub;
  // apiManagerProxy патчит прототипы Worker'ов на импорте — сами воркеры не нужны
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
  // jsdom's canvas.toDataURL returns null → @environment/webpSupport crashes at import
  HTMLCanvasElement.prototype.toDataURL = function() { return 'data:image/webp;base64,UklGRhIAAABX'; };
});

const peersMock = vi.hoisted(() => ({} as Record<string, any>));

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 1,
    managers: {
      appUsersManager: {
        getContactsPeerIds: async(): Promise<PeerId[]> => [100 as PeerId],
        resolveUserByUsername: async(): Promise<undefined> => undefined
      },
      appNotificationsManager: {isPeerLocalMuted: async() => false}
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => peersMock
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

// синглтон поднимает воркеров на импорте — страница тянет его через утилиты
vi.mock('@/vkgram/utils/getDialogLastMessage', () => ({
  default: (): undefined => undefined
}));

vi.mock('@helpers/date', () => ({
  formatDateAccordingToTodayNew: (date: Date) => `${date.getHours()}:00`
}));

vi.mock('@components/wrappers/messageForReply', () => ({
  default: (): null => null
}));
vi.mock('@components/wrappers/peerTitle', () => ({
  default: (): null => null
}));
vi.mock('@components/wrappers/dialogSubtitle', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/pages/channel/VKChannelPage', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/pages/messages/openChat', () => ({
  openVKChat: vi.fn()
}));
vi.mock('@/vkgram/pages/profile/openProfile', () => ({
  openVKProfile: vi.fn(),
  openVKPeerPage: vi.fn()
}));

vi.mock('@appManagers/utils/dialogs/getDialogIndex', () => ({
  default: (): undefined => undefined
}));

vi.mock('@appManagers/utils/users/sortContacts', () => ({
  default: (ids: PeerId[]) => ({peerIds: [...ids]})
}));

vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  // Friends: the dialog order of the contacts; Channels: the subscribed channels hook
  fetchFolder: async(): Promise<Dialog[]> => [],
  isBroadcastChannel: () => false,
  isMessagesPeer: () => false,
  isSubscribedChannel: () => false,
  default: () => ({
    isReady: () => true,
    channels: () => [{peerId: -300 as PeerId}],
    notifyVersion: (): number => 0
  })
}));

vi.mock('@/vkgram/hooks/useChannelFolders', () => ({
  default: () => ({
    isReady: () => true,
    folders: () => [{id: 2, title: 'Работа', peerIds: [100 as PeerId, -300 as PeerId]}]
  })
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

// the Telegram folder form needs Web K's input fields and the filters storage
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

const dispose: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  resetVKLocalFoldersSettings();
  peersMock[100] = {_: 'user', first_name: 'Тест', pFlags: {}};
});
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  setFriendsCustomizeOpen(false);
  setChannelsCustomizeOpen(false);
  delete peersMock[100];
});

const mount = (jsx: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

// the page data arrives asynchronously (contacts, channels): the local tabs follow it
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

const fillAndPick = (root: HTMLElement, title: string) => {
  (root.querySelector('.vk-folder-add') as HTMLButtonElement).click();
  (root.querySelector('.vk-picker-mock-done') as HTMLButtonElement).click();
  const input = root.querySelector<HTMLInputElement>('.vk-folder-name input')!;
  input.value = title;
  input.dispatchEvent(new Event('input', {bubbles: true}));
};

const topModal = (root: HTMLElement) => {
  const dialogs = root.querySelectorAll('.vk-modal-mock');
  return dialogs[dialogs.length - 1] as HTMLElement;
};

const saveButton = (root: HTMLElement) =>
  topModal(root).querySelector<HTMLButtonElement>('.vk-modal-foot .vk-button:not(.vk-button-secondary)')!;

describe('mobile tabs of «Друзья»', () => {
  it('the sections, the Telegram folders and the local ones are one strip with a pinned «+»', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    createVKLocalFolder('Друзья', [100] as PeerId[]);

    const root = mount(() => <VKPageFriends />);
    await nextTick();

    const tabs = [...root.querySelectorAll('.vk-messages-folders-tabs .vk-tab')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Контакты', 'Все чаты', 'Поиск', 'Работа', 'Друзья']);
    // no strip of its own for the sections; the search is its own block, like in «Сообщениях»
    expect(root.querySelector('.vk-friends-tabs-block')).toBeNull();
    expect(root.querySelector('.vk-messages-search-block .vk-search')).toBeTruthy();
    // the management of the Telegram folders is not next to the tabs on a phone
    expect(root.querySelector('.vk-messages-folders-tabs .vk-news-settings-button')).toBeNull();

    expect(root.querySelector('.vk-messages-folders-tabs .vk-tab-add')).toBeNull();
    const add = root.querySelector<HTMLButtonElement>('.vk-messages-folders-tabs .vk-tabs-add')!;
    expect(add.getAttribute('aria-label')).toBe('Создать папку');
    expect(tabs[0].classList.contains('is-active')).toBe(true);
  });

  it('a local folder is picked and put down like a section tab', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    createVKLocalFolder('Друзья', [100] as PeerId[]);

    const root = mount(() => <VKPageFriends />);
    await nextTick();

    const tabs = [...root.querySelectorAll<HTMLButtonElement>('.vk-messages-folders-tabs .vk-tab')];
    tabs[4].click();
    expect(tabs[4].classList.contains('is-active')).toBe(true);
    expect(tabs[0].classList.contains('is-active')).toBe(false);

    tabs[4].click();
    expect(tabs[4].classList.contains('is-active')).toBe(false);
    expect(tabs[0].classList.contains('is-active')).toBe(true);
  });

  it('the pinned «+» opens both kinds of folders in one window', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    const root = mount(() => <VKPageFriends />);
    await nextTick();

    (root.querySelector('.vk-messages-folders-tabs .vk-tabs-add') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Новая папка');
    expect([...root.querySelectorAll('.vk-folder-add-tabs .vk-tab')].map((tab) => tab.textContent))
      .toEqual(['Локальная папка', 'Папка Telegram']);
  });

  it('the top bar opens the «Настроить» window with both folder kinds', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    createVKLocalFolder('Друзья', [100] as PeerId[]);

    const root = mount(() => <VKPageFriends />);
    await nextTick();

    setFriendsCustomizeOpen(true);
    const customize = root.querySelector('.vk-modal-mock[data-title="Настроить"]')!;
    expect(customize).toBeTruthy();
    expect([...customize.querySelectorAll('.vk-news-settings-title')].map((title) => title.textContent))
      .toEqual(['Папки Telegram', 'Локальные папки']);

    (customize.querySelector('.vk-modal-foot .vk-button') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock[data-title="Настроить"]')).toBeNull();
  });
});

describe('mobile tabs of «Каналы»', () => {
  it('«Все», the Telegram folders and the local ones are one strip with a pinned «+»', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    createVKLocalFolder('Мои', [-300] as PeerId[]);

    const root = mount(() => <VKPageChannels />);
    await nextTick();

    const tabs = [...root.querySelectorAll('.vk-messages-folders-tabs .vk-tab')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Все', 'Работа', 'Мои']);
    expect(root.querySelector('.vk-messages-folders-tabs .vk-news-settings-button')).toBeNull();
    expect(root.querySelector('.vk-messages-folders-tabs .vk-tab-add')).toBeNull();
    expect(root.querySelector('.vk-messages-folders-tabs .vk-tabs-add')).toBeTruthy();
    expect(tabs[0].classList.contains('is-active')).toBe(true);
  });

  it('the top bar opens the «Настроить» window with both folder kinds', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    const root = mount(() => <VKPageChannels />);
    await nextTick();

    setChannelsCustomizeOpen(true);
    const customize = root.querySelector('.vk-modal-mock[data-title="Настроить"]')!;
    expect([...customize.querySelectorAll('.vk-news-settings-title')].map((title) => title.textContent))
      .toEqual(['Папки Telegram', 'Локальные папки']);
  });
});

describe('VKFoldersCustomizeModal', () => {
  it('the Telegram section has no pencil, the local one edits and picks the folder', () => {
    createVKLocalFolder('Друзья', [100] as PeerId[]);
    const onSelectFolder = vi.fn();

    const root = mount(() => (
      <VKFoldersCustomizeModal
        onClose={vi.fn()}
        tgFolders={[{id: 2, title: 'Работа', peerIds: new Set([100 as PeerId, -300 as PeerId])}]}
        onSelectFolder={onSelectFolder}
      />
    ));

    const sections = [...root.querySelectorAll('.vk-news-customize-section')];
    expect(sections).toHaveLength(2);
    // the Telegram folders are edited in Telegram: no pencil in their rows
    const tgRow = sections[0].querySelector('.vk-header-settings-block')!;
    expect(tgRow.querySelectorAll('.vk-header-settings-icon')).toHaveLength(3); // up, down, delete
    // the local ones are edited in VKgram: the pencil is there
    const localRow = sections[1].querySelector('.vk-header-settings-block')!;
    expect(localRow.querySelectorAll('.vk-header-settings-icon')).toHaveLength(4);

    // «Создать» of the Telegram section opens Web K's folder creation window
    (sections[0].querySelector('.vk-news-settings-head .vk-link-button') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-folder-create-mock')).toBeTruthy();

    // «Создать» of the local section opens the local folder dialog
    (sections[1].querySelector('.vk-news-settings-head .vk-link-button') as HTMLButtonElement).click();
    expect(topModal(root).getAttribute('data-title')).toBe('Новая папка');
    fillAndPick(root, 'Мои');
    saveButton(root).click();
    expect(onSelectFolder).toHaveBeenCalledWith(vkLocalFolders()[1].id);
  });
});

describe('the customize signals', () => {
  it('start closed and share one signal per section', () => {
    const [friendsOpen] = useFriendsCustomize();
    const [channelsOpen] = useChannelsCustomize();
    expect(friendsOpen()).toBe(false);
    expect(channelsOpen()).toBe(false);
    setFriendsCustomizeOpen(true);
    expect(friendsOpen()).toBe(true);
    expect(channelsOpen()).toBe(false);
  });
});

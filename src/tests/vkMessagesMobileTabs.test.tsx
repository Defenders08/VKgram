import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import VKPageMessages from '@/vkgram/pages/VKPageMessages';
import VKMessagesCustomizeModal from '@/vkgram/pages/messages/VKMessagesCustomizeModal';
import useMessagesCustomize, {setMessagesCustomizeOpen} from '@/vkgram/pages/messages/customize';
import {createVKLocalFolder, resetVKLocalFoldersSettings, vkLocalFolders} from '@/vkgram/pages/localFolders/settings';

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
const dialogsMock = vi.hoisted(() => [] as any[]);

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 1,
    managers: {appNotificationsManager: {isPeerLocalMuted: (): undefined => undefined}},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

// синглтон поднимает воркеров на импорте — страница тянет его через утилиты,
// а тесту достаточно методов-заглушек
vi.mock('@lib/apiManagerProxy', () => ({
  default: new Proxy({}, {
    get: (target: any, key: string | symbol) => {
      if(key === 'then') return undefined;
      return (target[key] ??= vi.fn());
    }
  })
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => peersMock
}));

vi.mock('@stores/fullPeers', () => ({
  useFullPeer: () => (): undefined => undefined
}));

vi.mock('@components/appNavigationController', () => ({
  default: new Proxy({}, {
    get: (target: any, key: string | symbol) => {
      if(key === 'then') return undefined;
      return (target[key] ??= vi.fn());
    }
  })
}));

// «контекст-меню строки» и «меню сообщения» тянут граф менеджеров — здесь не тестируются
vi.mock('@/vkgram/pages/messages/createMessageMenu', () => ({
  default: () => ({destroy: vi.fn()})
}));

// хук-модуль с named-экспортами: страница берёт из него выборку диалогов и предикаты пиров
// (fetchFolder отвечает самим списком диалогов; архив — папка 1)
vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  fetchFolder: async(folderId: number) => (folderId === 1 ? [] : dialogsMock),
  isBroadcastChannel: () => false,
  isMessagesPeer: (peer: any) => !!peer,
  isSubscribedChannel: () => false
}));

vi.mock('@/vkgram/hooks/useChannelFolders', () => ({
  default: () => ({
    isReady: () => true,
    folders: () => [{id: 2, title: 'Работа', peerIds: [100 as PeerId]}]
  })
}));

vi.mock('@/vkgram/utils/getDialogLastMessage', () => ({
  default: (): undefined => undefined
}));

vi.mock('@helpers/date', () => ({
  formatDateAccordingToTodayNew: (date: Date) => `${date.getHours()}:00`
}));

vi.mock('@/vkgram/pages/channel/createChannelHistory', () => ({
  default: () => ({})
}));

vi.mock('@/vkgram/pages/profile/openProfile', () => ({
  openVKPeerPage: vi.fn()
}));

vi.mock('@/vkgram/pages/channel/openChannel', () => ({
  openVKChannelPage: vi.fn()
}));

vi.mock('@/vkgram/pages/channel/postSelection', () => ({
  clearSelection: vi.fn()
}));

// Композер в рабочем дереве полу-слит и падает на импорте webpSupport — как и медиа-тесты
vi.mock('@/vkgram/components/VKComposer', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/components/MessageRenderer', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/components/VKServiceMessage', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/components/VKPeerAvatar', () => ({
  default: (): null => null
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

// the Telegram folder form needs Web K's input fields and the filters storage
vi.mock('@/vkgram/components/VKFolderCreateModal', () => ({
  default: (): null => null,
  VKFolderCreateForm: (): null => null
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
  dialogsMock.length = 0;
  dialogsMock.push({peerId: 100, top_message: undefined, unread_count: 0, pFlags: {}});
  peersMock[100] = {_: 'user', first_name: 'Тест'};
});
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  setMessagesCustomizeOpen(false);
  delete peersMock[100];
});

const mount = (jsx: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

// the dialogs of the list arrive asynchronously (fetchFolder), the local tabs follow them
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

describe('mobile tabs of «Сообщения»', () => {
  it('the sorting, the Telegram folders and the local ones are one strip with a pinned «+»', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    createVKLocalFolder('Друзья', [100] as PeerId[]);

    const root = mount(() => <VKPageMessages />);
    await nextTick();

    // one strip, like in «Новостях»: the sorting first, then both kinds of folders
    const tabs = [...root.querySelectorAll('.vk-messages-folders-tabs .vk-tab')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Все', 'Личное', 'Архив', 'Работа', 'Друзья']);
    // no strip of its own for the sorting, no block of its own for the local folders
    expect(root.querySelector('.vk-messages-tabs-block')).toBeNull();
    expect(root.querySelectorAll('.vk-messages-folders-tabs .vk-folders-block')).toHaveLength(0);

    // the settings of the side rail are not next to the tabs on a phone
    expect(root.querySelector('.vk-messages-folders-tabs .vk-news-settings-button')).toBeNull();

    // «+» is pinned at the right end, not inline after the last tab
    expect(root.querySelector('.vk-messages-folders-tabs .vk-tab-add')).toBeNull();
    const add = root.querySelector<HTMLButtonElement>('.vk-messages-folders-tabs .vk-tabs-add')!;
    expect(add.getAttribute('aria-label')).toBe('Создать папку');
    // the first tab of the strip is «Все» of the sorting, active by default
    expect(tabs[0].classList.contains('is-active')).toBe(true);
  });

  it('a local folder is picked and put down like a server one', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    createVKLocalFolder('Друзья', [100] as PeerId[]);

    const root = mount(() => <VKPageMessages />);
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
    const root = mount(() => <VKPageMessages />);
    await nextTick();

    (root.querySelector('.vk-messages-folders-tabs .vk-tabs-add') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Новая папка');
    expect([...root.querySelectorAll('.vk-folder-add-tabs .vk-tab')].map((tab) => tab.textContent))
      .toEqual(['Локальная папка', 'Папка Telegram']);
  });

  it('the settings live in the «Настроить» window, opened from anywhere', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    const root = mount(() => <VKPageMessages />);
    await nextTick();

    // the icon of the mobile top bar opens the very window the page hosts
    setMessagesCustomizeOpen(true);
    const customize = root.querySelector('.vk-modal-mock[data-title="Настроить"]')!;
    expect(customize).toBeTruthy();
    expect([...customize.querySelectorAll('.vk-news-settings-title')].map((title) => title.textContent))
      .toEqual(['Настройки диалогов', 'Настройка папок']);

    (customize.querySelector('.vk-modal-foot .vk-button') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-modal-mock[data-title="Настроить"]')).toBeNull();
  });

  it('the empty state opens the same window from its «Настройки диалогов» link', async() => {
    vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
    // an archived dialog: «Не показывать архивные диалоги» (the default) leaves the list empty,
    // and the empty state tells so and offers the settings
    dialogsMock.length = 0;
    dialogsMock.push({peerId: 100, folder_id: 1, top_message: undefined, unread_count: 0, pFlags: {}});

    const root = mount(() => <VKPageMessages />);
    await nextTick();

    const link = [...root.querySelectorAll('.vk-messages-empty .vk-link-button')]
      .find((button) => button.textContent === 'Настройки диалогов') as HTMLButtonElement;
    expect(link).toBeTruthy();
    link.click();
    expect(root.querySelector('.vk-modal-mock[data-title="Настроить"]')).toBeTruthy();
  });
});

describe('VKMessagesCustomizeModal', () => {
  it('creates a local folder from the panel and picks it in the list', () => {
    const onSelectFolder = vi.fn();
    const root = mount(() => (
      <VKMessagesCustomizeModal onClose={vi.fn()} applies={true} onSelectFolder={onSelectFolder} />
    ));

    (root.querySelectorAll('.vk-news-settings-head .vk-link-button')[1] as HTMLButtonElement).click();
    expect(topModal(root).getAttribute('data-title')).toBe('Новая папка');

    fillAndPick(root, 'Мои');
    saveButton(root).click();

    expect(onSelectFolder).toHaveBeenCalledWith(vkLocalFolders()[0].id);
  });
});

describe('useMessagesCustomize', () => {
  it('starts closed and shares one signal', () => {
    const [isOpen] = useMessagesCustomize();
    expect(isOpen()).toBe(false);
    setMessagesCustomizeOpen(true);
    expect(isOpen()).toBe(true);
  });
});

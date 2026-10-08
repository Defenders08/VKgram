import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import MessageRenderer from '@/vkgram/components/MessageRenderer';
import openTgLink from '@/vkgram/utils/openTgLink';
import {openVKPeerPage} from '@/vkgram/pages/profile/openProfile';
import type {Message} from '@layer';

// jsdom без IntersectionObserver: его требует AnimationIntersector, который
// тянется импортами (customEmoji → animationIntersector) до рендера
vi.hoisted(() => {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
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
const openVKChannelMock = vi.hoisted(() => vi.fn());
const openVKChatMock = vi.hoisted(() => vi.fn());
const openVKSectionMock = vi.hoisted(() => vi.fn());
const resolveUsernameMock = vi.hoisted(() => vi.fn());

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {appUsersManager: {resolveUsername: resolveUsernameMock}},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => peersMock
}));

// хук тянет @appManagers/utils/dialogs → тяжёлый граф менеджеров; в тесте нужна
// только функция «это канал-лента»
vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  isBroadcastChannel: (peer: any) => peer?._ === 'channel' && !!peer?.broadcast
}));

// навигация ВК-страницами проверяется моками: сами роуты тянут Web K навигатор
vi.mock('@/vkgram/pages/channel/route', () => ({
  openVKChannel: openVKChannelMock
}));

vi.mock('@/vkgram/pages/messages/openChat', () => ({
  openVKChat: openVKChatMock
}));

vi.mock('@/vkgram/sections', () => ({
  openVKSection: openVKSectionMock
}));

vi.mock('@/vkgram/webk', () => ({
  openWebKProfile: vi.fn()
}));

vi.mock('@/vkgram/pages/profile/route', () => ({
  openVKProfilePeer: vi.fn()
}));

vi.mock('@helpers/mediaSizes', () => ({
  // customProperties (тянется темами на импорте) вешает на него listener
  default: {isMobile: false, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

// режим выделения постов тянет граф пересылки — для рендера текста достаточно заглушек
vi.mock('@/vkgram/pages/channel/postSelection', () => ({
  isSelecting: () => false,
  isPostSelected: () => false,
  togglePostSelection: vi.fn()
}));

vi.mock('@appManagers/utils/peers/getPeerActiveUsernames', () => ({
  default: (): any[] => []
}));

vi.mock('@appManagers/utils/peers/getPeerId', () => ({
  default: (peer: any) => ('user_id' in peer ? peer.user_id : `-${peer.channel_id ?? peer.chat_id}`)
}));

// реальному форматтеру нужен язык i18n, который тесты не поднимают
vi.mock('@helpers/date', () => ({
  formatDateAccordingToTodayNew: (date: Date) => `${date.getHours()}:00`
}));

// renderer тянет apiManagerProxy, который на импорту поднимает Worker'ов —
// кастомные эмодзи в этом тесте не рендерятся
vi.mock('@lib/customEmoji/renderer', () => ({
  CustomEmojiRendererElement: class CustomEmojiRendererElementStub {},
  CustomEmojiRendererElementOptions: {}
}));

// wrapRichText импортирует рендерер кастомных эмодзи — здесь он не тестируется
vi.mock('@lib/customEmoji/element', () => ({
  default: class CustomEmojiElementStub {},
  CustomEmojiElements: Set
}));

vi.mock('@/vkgram/components/VKPeerAvatar', () => ({
  default: () => <span class="avatar-mock" />
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

vi.mock('@/vkgram/components/MessageMedia', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/components/MessageMeta', () => ({
  default: () => <span class="meta-mock" />
}));

vi.mock('@/vkgram/pages/channel/VKChannelPostReactions', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/pages/channel/VKChannelPostComments', () => ({
  default: (): null => null
}));

const dispose: (() => void)[] = [];
// в тестах id пиров живут строками (ключи стора); PeerId типизирован числом
const pid = (s: string) => s as unknown as PeerId;
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  openVKChannelMock.mockClear();
  openVKChatMock.mockClear();
  openVKSectionMock.mockClear();
  resolveUsernameMock.mockReset();
  for(const key of Object.keys(peersMock)) delete peersMock[key];
});

const makeMessage = (over: Partial<Message.message> = {}) => ({
  _: 'message',
  mid: 7,
  peerId: '-300',
  date: 1759660000,
  message: 'Привет',
  pFlags: {out: false},
  ...over
} as unknown as Message.message);

const mount = (jsx: () => any) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

describe('a click on a channel opens the channel page, not the chat', () => {
  it('the header and the avatar of a channel dialog lead to «Каналы» (openVKPeerPage)', () => {
    openVKPeerPage(pid('-300'), {_: 'channel', title: 'Канал', broadcast: true});
    expect(openVKSectionMock).toHaveBeenCalledWith('channels');
    expect(openVKChannelMock).toHaveBeenCalledWith('-300');

    openVKPeerPage(pid('42'), {_: 'user', first_name: 'Ash'});
    expect(openVKSectionMock).toHaveBeenCalledWith('profile');
    expect(openVKChannelMock).toHaveBeenCalledTimes(1);
  });

  const openedChannelPage = (peerId: string) => {
    expect(openVKSectionMock).toHaveBeenCalledWith('channels');
    expect(openVKChannelMock).toHaveBeenCalledWith(peerId);
  };

  it('the author of a channel post in a chat is a button to the channel page', () => {
    peersMock['-300'] = {_: 'channel', title: 'Канал', broadcast: true};
    const root = mount(() => (
      <MessageRenderer message={makeMessage()} variant="chat-incoming" showAvatar showAuthor />
    ));
    const name = root.querySelector('button.vk-custom-message-author') as HTMLButtonElement;
    expect(name.textContent).toBe('Канал');
    name.click();
    openedChannelPage('-300');
  });

  it('the author of a user message in a chat stays plain text', () => {
    peersMock['42'] = {_: 'user', first_name: 'Ash'};
    const root = mount(() => (
      <MessageRenderer message={makeMessage({peerId: pid('42'), fromId: pid('42')})} variant="chat-incoming" showAvatar showAuthor />
    ));
    expect(root.querySelector('button.vk-custom-message-author')).toBeNull();
    expect(root.querySelector('.vk-custom-message-author')!.textContent).toBe('Ash');
  });

  it('«Репост: …» from a known channel is a button to the channel page', () => {
    peersMock['-300'] = {_: 'channel', title: 'Канал', broadcast: true};
    const root = mount(() => (
      <MessageRenderer
        message={makeMessage({fwd_from: {_: 'messageFwdHeader', from_id: {_: 'peerChannel', channel_id: 300}} as any})}
        variant="chat-incoming"
        showAvatar
        showAuthor
      />
    ));
    const from = root.querySelector('button.vk-custom-message-forward-from') as HTMLButtonElement;
    expect(from.textContent).toBe('Канал');
    from.click();
    openedChannelPage('-300');
  });

  it('«Репост: …» from a user stays plain text', () => {
    peersMock['42'] = {_: 'user', first_name: 'Ash'};
    const root = mount(() => (
      <MessageRenderer
        message={makeMessage({fwd_from: {_: 'messageFwdHeader', from_id: {_: 'peerUser', user_id: 42}} as any})}
        variant="chat-incoming"
        showAvatar
        showAuthor
      />
    ));
    expect(root.querySelector('button.vk-custom-message-forward-from')).toBeNull();
    expect(root.querySelector('.vk-custom-message-forward-from')!.textContent).toBe('Ash');
  });

  it('the name over a channel post (лента, страница канала) opens the channel page', () => {
    peersMock['-300'] = {_: 'channel', title: 'Канал', broadcast: true};
    const root = mount(() => (
      <MessageRenderer message={makeMessage()} variant="channel-post" />
    ));
    const name = root.querySelector('button.vk-channel-post-name') as HTMLButtonElement;
    expect(name.textContent).toBe('Канал');
    name.click();
    openedChannelPage('-300');
  });

  it('a t.me link to a broadcast channel opens «Каналы», to a megagroup — «Сообщения»', async() => {
    resolveUsernameMock.mockResolvedValue({_: 'channel', broadcast: true, id: {toPeerId: () => '-300'}});
    expect(await openTgLink('https://t.me/mychannel')).toBe(true);
    openedChannelPage('-300');
    expect(openVKChatMock).not.toHaveBeenCalled();

    resolveUsernameMock.mockResolvedValue({_: 'channel', id: {toPeerId: () => '-400'}});
    expect(await openTgLink('https://t.me/mygroup')).toBe(true);
    expect(openVKChatMock).toHaveBeenCalledWith('-400');
    expect(openVKChannelMock).toHaveBeenCalledTimes(1);
  });
});

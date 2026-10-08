import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import MessageText from '@/vkgram/components/MessageText';
import MessageRenderer from '@/vkgram/components/MessageRenderer';
import type {Message, MessageEntity} from '@layer';

// IntersectionObserver / Worker / canvas.toDataURL — общие стабы из setup.ts:
// этот файл тянет тот же тяжёлый граф (customEmoji → animationIntersector)

// синглтон прокси при импорте стартует крипто-воркер (fetch(undefined) в jsdom) — глушим
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => ({})
}));

// хук тянет @appManagers/utils/dialogs → тяжёлый граф менеджеров; в тесте нужна
// только функция «это канал-лента»
vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  isBroadcastChannel: (peer: any) => peer?._ === 'channel' && !!peer?.broadcast
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
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
});

// «plain » + пять слов по своим смещениям + «LINK»: 45 символов
const TEXT = 'plain BOLD ITAL UNDER STRIKE CODE HIDDEN LINK';
const ENTITIES: MessageEntity[] = [
  {_: 'messageEntityBold', offset: 6, length: 4},
  {_: 'messageEntityItalic', offset: 11, length: 4},
  {_: 'messageEntityUnderline', offset: 16, length: 5},
  {_: 'messageEntityStrike', offset: 22, length: 6},
  {_: 'messageEntityCode', offset: 29, length: 4},
  {_: 'messageEntitySpoiler', offset: 34, length: 6},
  {_: 'messageEntityTextUrl', offset: 41, length: 4, url: 'https://example.com'}
] as MessageEntity[];

const makeMessage = (entities: MessageEntity[] = ENTITIES) => ({
  _: 'message',
  mid: 7,
  peerId: '42',
  date: 1759660000,
  message: TEXT,
  entities,
  pFlags: {out: true}
} as unknown as Message.message);

describe('MessageText renders every formatting entity', () => {
  const mountText = (message: Message.message) => {
    const root = document.createElement('div');
    document.body.append(root);
    dispose.push(render(() => <MessageText message={message} class="vk-custom-message-text" />, root));
    return root;
  };

  it('wraps bold, italic, underline, strike and code into their native tags', () => {
    const root = mountText(makeMessage());
    expect(root.querySelector('strong')!.textContent).toBe('BOLD');
    expect(root.querySelector('em')!.textContent).toBe('ITAL');
    expect(root.querySelector('u')!.textContent).toBe('UNDER');
    expect(root.querySelector('del')!.textContent).toBe('STRIKE');
    expect(root.querySelector('code')!.textContent).toBe('CODE');
  });

  it('renders a spoiler into a clickable container and a link as an anchor', () => {
    const root = mountText(makeMessage());
    const spoilerContainer = root.querySelector('.spoilers-container')!;
    expect(spoilerContainer).toBeTruthy();
    expect(spoilerContainer.querySelector('.spoiler .spoiler-text')!.textContent).toBe('HIDDEN');
    const link = root.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe('LINK');
    expect(link.href).toContain('example.com');
  });

  it('keeps plain text around the entities', () => {
    const root = mountText(makeMessage());
    expect(root.querySelector('.vk-custom-message-text')!.textContent).toBe(TEXT);
  });

  it('renders nothing but an empty block when there is no text', () => {
    const root = mountText({...makeMessage([]), message: ''} as Message.message);
    expect(root.querySelector('.vk-custom-message-text')!.children.length).toBe(0);
  });
});

describe('MessageRenderer passes entities through to the text', () => {
  it('shows bold as <strong> in a chat message', () => {
    const root = document.createElement('div');
    document.body.append(root);
    dispose.push(render(() => (
      <MessageRenderer message={makeMessage()} variant="chat-outgoing" status="sent" />
    ), root));
    expect(root.querySelector('.vk-custom-message-text strong')!.textContent).toBe('BOLD');
  });

  it('shows bold as <strong> in a channel post', () => {
    const root = document.createElement('div');
    document.body.append(root);
    dispose.push(render(() => (
      <MessageRenderer message={makeMessage()} variant="channel-post" />
    ), root));
    expect(root.querySelector('.vk-channel-post-content strong')!.textContent).toBe('BOLD');
  });
});

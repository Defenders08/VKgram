import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  peers: {} as Record<PeerId, unknown>,
  getDialogs: vi.fn(),
  wrapMessageForReply: vi.fn()
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 0,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    managers: {
      dialogsStorage: {getDialogs: mocks.getDialogs},
      filtersStorage: {getDialogFilters: vi.fn(async() => [])},
      appNotificationsManager: {isPeerLocalMuted: vi.fn(async() => false)}
    }
  }
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {getMessageByPeer: vi.fn()}
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => mocks.peers
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (props: {peerId: PeerId}) => <span data-avatar={String(props.peerId)} />
}));

vi.mock('@components/wrappers/messageForReply', () => ({
  default: mocks.wrapMessageForReply
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: vi.fn(async() => {
    const span = document.createElement('span');
    span.textContent = 'Автор';
    return span;
  })
}));

vi.mock('@components/icon', () => ({
  default: (icon: string) => {
    const span = document.createElement('span');
    span.dataset.icon = icon;
    return span;
  }
}));

vi.mock('@helpers/date', () => ({
  formatDateAccordingToTodayNew: () => document.createTextNode('12:34')
}));

vi.mock('@/vkgram/pages/channel/route', () => ({
  vkChannelPeerId: (): undefined => undefined,
  openVKChannel: vi.fn()
}));

vi.mock('@/vkgram/pages/channel/VKChannelPage', () => ({
  default: () => <div />
}));

vi.mock('@/vkgram/hooks/useChannelFolders', () => ({
  default: (): {folders: () => any[], isReady: () => boolean} => ({folders: () => [], isReady: () => true})
}));

vi.mock('@/vkgram/pages/localFolders/settings', () => ({
  vkLocalFolders: (): any[] => []
}));

vi.mock('@/vkgram/components/VKLocalFolders', () => ({
  default: () => <div />
}));

vi.mock('@/vkgram/components/VKFolderCreateModal', () => ({
  default: () => <div />
}));

import {render} from 'solid-js/web';
import VKPageChannels from '@/vkgram/pages/VKPageChannels';
import type {Dialog} from '@appManagers/appMessagesManager';

// * the «true» regression: the row handed Web K's subtitle renderer a raw
// * MiddlewareHelper middleware (a () => boolean) where a promise wrapper is
// * expected — `await middleware(fragment)` evaluated to `true` and the literal
// * word «true» became the whole preview of every channel

const now = Math.floor(Date.now() / 1000);

function makeDialog(peerId: PeerId, index: number, fromId: PeerId, text: string) {
  return {
    _: 'dialog',
    peerId,
    folder_id: 0,
    index_0: index,
    top_message: index,
    unread_count: 0,
    pFlags: {},
    topMessage: {
      _: 'message',
      mid: index,
      peerId,
      fromId,
      date: now - 60,
      message: text,
      pFlags: {}
    }
  } as unknown as Dialog;
}

describe('«Каналы» last-message preview', () => {
  let dispose: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    for(const key of Object.keys(mocks.peers)) delete (mocks.peers as Record<string, unknown>)[key];

    if(!window.matchMedia) {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('601'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: () => false,
        onchange: null as MediaQueryList['onchange']
      })) as unknown as typeof window.matchMedia;
    }

    mocks.wrapMessageForReply.mockImplementation(async({message}: {message: {message: string}}) => {
      const fragment = document.createDocumentFragment();
      fragment.append(message.message);
      return fragment;
    });
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
  });

  it('shows the last message, not the literal «true»', async() => {
    // a channel's own post: the sender block is skipped, the text goes alone
    const ownPostPeerId = (-100555) as PeerId;
    mocks.peers[ownPostPeerId] = {
      _: 'channel',
      id: 555,
      title: 'Канал с постами',
      pFlags: {},
      usernames: [{_: 'username', username: 'ownposts', pFlags: {active: true}}]
    };

    // a post written by an admin personally: the sender opens the line
    const adminPostPeerId = (-100666) as PeerId;
    mocks.peers[adminPostPeerId] = {
      _: 'channel',
      id: 666,
      title: 'Канал с админом',
      pFlags: {}
    };

    const dialogs = [
      makeDialog(ownPostPeerId, 2, ownPostPeerId, 'Текст поста канала'),
      makeDialog(adminPostPeerId, 1, (-3) as PeerId, 'Сообщение админа')
    ];

    let calls = 0;
    mocks.getDialogs.mockImplementation(async() => ++calls === 1 ?
      {dialogs, isEnd: false} :
      {dialogs: [], isEnd: true});

    dispose = render(() => <VKPageChannels />, document.body);

    const previews = await vi.waitFor(() => {
      const rows = [...document.querySelectorAll<HTMLElement>('.vk-channel-row')];
      expect(rows).toHaveLength(2);
      return rows.map((row) => row.querySelector<HTMLElement>('.vk-message-dialog-preview'));
    });

    expect(previews.map((preview) => preview.textContent))
    .toEqual(['Текст поста канала', 'Автор: Сообщение админа']);
    for(const preview of previews) {
      expect(preview.textContent).not.toContain('true');
    }

    // the @username still sits next to the title
    const usernames = [...document.querySelectorAll<HTMLElement>('.vk-message-dialog-username')]
    .map((el) => el.textContent);
    expect(usernames).toContain('@ownposts');
  });
});

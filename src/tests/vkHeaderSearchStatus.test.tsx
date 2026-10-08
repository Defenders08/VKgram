import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import VKHeaderSearch from '@/vkgram/components/VKHeaderSearch';

const mocks = vi.hoisted(() => ({
  // what the connection-status hook answers: `undefined` — all is well
  statusText: undefined as string | undefined
}));

vi.mock('@/vkgram/hooks/useConnectionStatus', () => ({
  default: () => () => mocks.statusText
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => ({})
}));

vi.mock('@/vkgram/hooks/useContactPeerIds', () => ({
  default: (): (() => undefined) => () => undefined
}));

vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  default: () => ({channels: (): never[] => [], isReady: (): boolean => true}),
  useSubscribedGroups: () => ({groups: (): never[] => []})
}));

// the avatar is out of scope: the dropdown only places it
vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

vi.mock('@appManagers/utils/peers/getPeerActiveUsernames', () => ({
  default: (): never[] => []
}));

// picking a result only calls them
vi.mock('@/vkgram/pages/channel/openChannel', () => ({openVKChannelPage: vi.fn()}));
vi.mock('@/vkgram/pages/messages/openChat', () => ({openVKChat: vi.fn()}));
vi.mock('@/vkgram/pages/profile/openProfile', () => ({openVKProfile: vi.fn()}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  vi.clearAllMocks();
  mocks.statusText = undefined;
});

const mount = () => {
  dispose.push(render(() => <VKHeaderSearch />, document.body));
  return document.body;
};

const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>('.vk-header-search-input')!;

describe('VKHeaderSearch: the connection status', () => {
  it('a healthy connection keeps the search icon and the usual placeholder', () => {
    const root = mount();
    expect(root.querySelector('.vk-header-search-icon')).not.toBeNull();
    expect(root.querySelector('.vk-header-search-spinner')).toBeNull();
    expect(input(root).getAttribute('placeholder')).toBe('Поиск людей и сообществ');
    expect(root.querySelector('[role="status"]')).toBeNull();
  });

  it('a lost connection takes over the field: the ring instead of the icon, the status instead of the placeholder', () => {
    mocks.statusText = 'Waiting for network…';
    const root = mount();
    const spinner = root.querySelector<HTMLElement>('.vk-header-search-spinner')!;
    expect(spinner).not.toBeNull();
    expect(spinner.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.vk-header-search-icon')).toBeNull();
    expect(input(root).getAttribute('placeholder')).toBe('Waiting for network…');
    // a placeholder change is silent for AT, so the field announces it itself
    const announcement = root.querySelector<HTMLElement>('[role="status"]');
    expect(announcement?.textContent).toBe('Waiting for network…');
    expect(announcement!.classList.contains('vk-visually-hidden')).toBe(true);
  });
});

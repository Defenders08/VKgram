import {afterEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
// ChatId's `.toPeerId()` lives on the Number prototype: jsdom tests need the polyfill
import '@helpers/peerIdPolyfill';
import VKProfilePersonalChannel from '@/vkgram/pages/profile/VKProfilePersonalChannel';

const mocks = vi.hoisted(() => ({
  getAdminedPersonalChannels: vi.fn(async() => [101 as ChatId]),
  updatePersonalChannel: vi.fn(async() => {}),
  toastNew: vi.fn()
}));

// the mock factories are hoisted above plain consts
const {notReady, stub} = vi.hoisted(() => ({
  notReady: (): (() => undefined) => () => undefined,
  stub: (): null => null
}));

vi.mock('@lib/rootScope', () => ({
  default: {myId: 1, managers: {
    appProfileManager: {
      getAdminedPersonalChannels: mocks.getAdminedPersonalChannels,
      updatePersonalChannel: mocks.updatePersonalChannel
    }
  }, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

vi.mock('@stores/peers', () => ({
  useChat: notReady,
  usePeers: () => ({})
}));

vi.mock('@stores/fullPeers', () => ({
  useFullPeer: notReady
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: stub
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

// the create window is out of scope; the channel page too
vi.mock('@/vkgram/pages/channel/VKChannelEditModal', () => ({
  openVKChannelCreate: vi.fn(() => {
    throw new Error('no window');
  })
}));
vi.mock('@/vkgram/pages/channel/openChannel', () => ({
  openVKChannelPage: vi.fn()
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const mount = (jsx: () => JSX.Element) => {
  // jsdom has no matchMedia (VKModal asks «pointer: coarse» for the focus target)
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
  // VKModal portals into the VKgram root
  const vkgram = document.createElement('div');
  vkgram.className = 'vkgram';
  document.body.append(vkgram);
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

const flush = () => new Promise((resolve) => setTimeout(resolve));

const pickChannel = async(root: HTMLElement) => {
  (root.querySelector('.vk-button') as HTMLButtonElement).click();
  // the list is a manager answer away
  await flush();

  const modal = document.querySelector('.vkgram .vk-modal') as HTMLElement;
  expect(modal).toBeTruthy();
  // the admined channel is offered, then the click saves it
  (modal.querySelector('.vk-picker-row') as HTMLButtonElement).click();
  await flush();
};

describe('VKProfilePersonalChannel', () => {
  it('opens the picker from the block and saves the picked channel', async() => {
    const root = mount(() => <VKProfilePersonalChannel channelId={undefined} />);

    expect(root.textContent).toContain('У вас пока нет личного канала.');
    await pickChannel(root);
    expect(mocks.updatePersonalChannel).toHaveBeenCalledWith(101);
  });

  it('opens the picker from the bare item of «Настроек» and saves the picked channel', async() => {
    const root = mount(() => <VKProfilePersonalChannel channelId={undefined} bare />);

    expect(root.textContent).toContain('У вас пока нет личного канала.');
    await pickChannel(root);
    expect(mocks.updatePersonalChannel).toHaveBeenCalledWith(101);
  });
});

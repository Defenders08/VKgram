import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import VKAudioCustomizeModal from '@/vkgram/pages/audio/VKAudioCustomizeModal';
import useAudioCustomize, {setAudioCustomizeOpen} from '@/vkgram/pages/audio/customize';

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
});
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  setAudioCustomizeOpen(false);
});

const mount = (jsx: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

const fillAndPick = (root: HTMLElement, title: string) => {
  (root.querySelector('.vk-folder-add') as HTMLButtonElement).click();
  (root.querySelector('.vk-picker-mock-done') as HTMLButtonElement).click();
  const input = root.querySelector<HTMLInputElement>('.vk-folder-name input')!;
  input.value = title;
  input.dispatchEvent(new Event('input', {bubbles: true}));
};

describe('VKAudioCustomizeModal', () => {
  it('holds the audio folders panel and opens the folder dialog from it', () => {
    const root = mount(() => <VKAudioCustomizeModal onClose={vi.fn()} />);

    expect(root.querySelector('.vk-modal-mock')?.getAttribute('data-title')).toBe('Настроить');
    expect(root.querySelector('.vk-news-settings-title')?.textContent).toBe('Папки');
    expect(root.querySelector('.vk-messages-search-block')).toBeNull();

    (root.querySelector('.vk-news-settings-head .vk-link-button') as HTMLButtonElement).click();
    expect(root.querySelector('.vk-folder-name input')).toBeTruthy();
  });
});

describe('useAudioCustomize', () => {
  it('starts closed and shares one signal', () => {
    const [isOpen] = useAudioCustomize();
    expect(isOpen()).toBe(false);
    setAudioCustomizeOpen(true);
    expect(isOpen()).toBe(true);
  });
});

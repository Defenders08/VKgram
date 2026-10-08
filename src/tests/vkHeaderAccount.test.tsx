import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import VKHeaderAccount from '@/vkgram/components/VKHeaderAccount';

const mocks = vi.hoisted(() => ({
  openVKSection: vi.fn(),
  addAccount: vi.fn()
}));

vi.mock('@lib/rootScope', () => ({
  default: {myId: {toUserId: () => '1', toPeerId: () => 'user1'}}
}));

const testUser = {
  _: 'user' as const,
  id: '1',
  first_name: 'Эш',
  last_name: 'Втфонлайн',
  username: 'ashwtfonline',
  pFlags: {}
};

vi.mock('@stores/peers', () => ({
  // the component narrows the accessor it is given; hand the same user back whatever the getter
  useUser: () => () => testUser
}));

vi.mock('@/vkgram/sections', () => ({
  openVKSection: mocks.openVKSection
}));

vi.mock('@appManagers/utils/peers/getPeerActiveUsernames', () => ({
  default: (user: typeof testUser) => user.username ? [user.username] : []
}));

// the avatar manager is out of scope: the row only places it
vi.mock('@/vkgram/components/VKPeerAvatar', () => ({
  default: () => <span class="avatar-mock" />
}));

vi.mock('@/vkgram/accounts', () => ({
  // VKgram's own entry into the add-account flow; the menu only opens it
  addVKgramAccount: mocks.addAccount
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  vi.clearAllMocks();
});

const mount = (variant: 'desktop' | 'mobile') => {
  dispose.push(render(() => <VKHeaderAccount variant={variant} />, document.body));
  return document.body;
};

const field = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.vk-header-logo')!;
const menu = (root: HTMLElement) => root.querySelector('.vk-account-menu');

describe('VKHeaderAccount', () => {
  it('the desktop field shows the username and opens the menu with the account and «Добавить аккаунт»', () => {
    const root = mount('desktop');
    const logo = field(root);
    expect(logo.classList.contains('has-user')).toBe(true);
    expect(logo.querySelector('.vk-header-user-name')?.textContent).toBe('ashwtfonline');
    expect(menu(root)).toBeNull();

    logo.click();
    const panel = menu(root) as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.vk-account-menu-title')?.textContent).toBe('Аккаунт');
    expect(panel.querySelector('.vk-account-menu-name-title')?.textContent).toBe('Эш Втфонлайн');
    expect(panel.querySelector('.vk-account-menu-name-note')?.textContent).toBe('@ashwtfonline');
    expect([...panel.querySelectorAll('.vk-account-menu-item')].map((el) => el.textContent)).toContain('Добавить аккаунт');
    expect(logo.getAttribute('aria-expanded')).toBe('true');
  });

  it('the account row closes the menu and opens «Страница»', () => {
    const root = mount('desktop');
    field(root).click();
    (menu(root)!.querySelector<HTMLButtonElement>('.vk-account-menu-item')!).click();
    expect(mocks.openVKSection).toHaveBeenCalledWith('profile');
    // the panel stays a moment to be seen leaving
    expect(menu(root)!.classList.contains('is-closing')).toBe(true);
  });

  it('«Добавить аккаунт» runs the add-account flow of Web K', async() => {
    const root = mount('desktop');
    field(root).click();
    const row = [...menu(root)!.querySelectorAll<HTMLButtonElement>('.vk-account-menu-item')]
      .find((el) => el.textContent === 'Добавить аккаунт')!;
    row.click();
    await vi.waitFor(() => expect(mocks.addAccount).toHaveBeenCalledTimes(1));
  });

  it('Escape closes the menu and returns the focus to the field', () => {
    const root = mount('desktop');
    const logo = field(root);
    logo.click();
    expect(menu(root)).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}));
    expect(menu(root)!.classList.contains('is-closing')).toBe(true);
    expect(document.activeElement).toBe(logo);
  });

  it('a click outside closes the menu', () => {
    const root = mount('desktop');
    field(root).click();
    expect(menu(root)).not.toBeNull();

    document.body.dispatchEvent(new Event('pointerdown'));
    expect(menu(root)!.classList.contains('is-closing')).toBe(true);
  });

  it('a phone has no wordmark in its bar', () => {
    const root = mount('mobile');
    expect(root.querySelector('.vk-header-logo')).toBeNull();
    expect(root.querySelector('.vk-header-account')).toBeNull();
    expect(mocks.openVKSection).not.toHaveBeenCalled();
  });
});

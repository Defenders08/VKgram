import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import VKSidebar from '@/vkgram/components/VKSidebar';
import {resetVKSidebarMenuSettings, setVKSidebarMenuSectionVisible} from '@/vkgram/pages/settings/sidebarMenu';

const mocks = vi.hoisted(() => ({
  confirmVKLogout: vi.fn(),
  unread: {count: 0, isMuted: false}
}));

vi.mock('@lib/rootScope', () => ({
  default: {myId: {toUserId: () => '1'}}
}));

const testUser = {
  _: 'user' as const,
  id: '1',
  first_name: 'Иван',
  last_name: 'Петров',
  username: 'ivan',
  pFlags: {}
};

vi.mock('@stores/peers', () => ({
  // the component narrows the accessor it is given; hand the same user back whatever the getter
  useUser: () => () => testUser
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

vi.mock('@/vkgram/hooks/createMessagesUnread', () => ({
  default: () => () => mocks.unread,
  formatUnreadBadge: (count: number) => count > 99 ? '99+' : String(count)
}));

vi.mock('@/vkgram/logout', () => ({
  confirmVKLogout: mocks.confirmVKLogout
}));

// the real one mounts the playback controller: the drawer only places it, the player itself is out of scope here
vi.mock('@/vkgram/components/VKMiniPlayer', () => ({
  default: (): null => null
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  resetVKSidebarMenuSettings();
});

const mount = (props: Parameters<typeof VKSidebar>[0]) => {
  dispose.push(render(() => <VKSidebar {...props} />, document.body));
  return document.body;
};

const rowTitles = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.vk-sidebar-item .vk-sidebar-item-text')].map((el) => el.textContent);

describe('VKSidebar drawer variant', () => {
  it('opens with the profile header and no «Страница» row', () => {
    const root = mount({active: 'news', onSectionChange: vi.fn(), withLogout: true, variant: 'drawer'});
    expect(root.querySelector('.vk-menu-header-name')?.textContent).toBe('Иван Петров');
    expect(root.querySelector('.vk-menu-header-username')?.textContent).toBe('@ivan');
    expect(rowTitles(root)).not.toContain('Страница');
    expect(rowTitles(root)).toContain('Новости');
    expect(rowTitles(root)).toContain('Выйти');
  });

  it('puts icons on every row, the unread number on «Сообщения» and the danger color on «Выйти»', () => {
    mocks.unread = {count: 5, isMuted: false};
    const root = mount({active: 'news', onSectionChange: vi.fn(), withLogout: true, variant: 'drawer'});
    const rows = [...root.querySelectorAll<HTMLElement>('.vk-sidebar-item')];
    expect(rows.length).toBeGreaterThan(0);
    for(const row of rows) expect(row.querySelector('.vk-sidebar-item-icon')).toBeTruthy();
    const messages = rows.find((row) => row.textContent?.includes('Сообщения'))!;
    expect(messages.querySelector('.vk-sidebar-item-badge')?.textContent).toBe('5');
    expect(messages.classList.contains('has-badge')).toBe(true);
    expect(root.querySelector('.vk-sidebar-item-logout .vk-sidebar-item-icon')).toBeTruthy();
    mocks.unread = {count: 0, isMuted: false};
  });

  it('marks the active row and reports clicks up', () => {
    const onSectionChange = vi.fn();
    const root = mount({active: 'audio', onSectionChange, withLogout: true, variant: 'drawer'});
    const audio = [...root.querySelectorAll<HTMLElement>('.vk-sidebar-item')]
      .find((row) => row.textContent?.includes('Аудиозаписи'))!;
    expect(audio.classList.contains('is-active')).toBe(true);
    expect(audio.getAttribute('aria-current')).toBe('page');

    audio.click();
    expect(onSectionChange).toHaveBeenCalledWith('audio');
  });

  it('the header is «Страница»: active there, opens the profile, «Выйти» confirms the logout', () => {
    const onSectionChange = vi.fn();
    const root = mount({active: 'profile', onSectionChange, withLogout: true, variant: 'drawer'});
    const header = root.querySelector<HTMLButtonElement>('.vk-menu-header')!;
    expect(header.classList.contains('is-active')).toBe(true);
    expect(header.getAttribute('aria-current')).toBe('page');

    header.click();
    expect(onSectionChange).toHaveBeenCalledWith('profile');

    (root.querySelector<HTMLButtonElement>('.vk-sidebar-item-logout')!).click();
    expect(mocks.confirmVKLogout).toHaveBeenCalled();
  });

  it('the desktop menu keeps its plain text shape', () => {
    const root = mount({active: 'news', onSectionChange: vi.fn(), withLogout: true});
    expect(root.querySelector('.vk-menu-header')).toBeNull();
    expect(rowTitles(root)).toContain('Страница');
    expect(root.querySelector('.vk-sidebar-item-icon')).toBeNull();
    expect(root.querySelector('.vk-sidebar-item-badge')).toBeNull();
  });
});

describe('VKSidebar and «Левое меню» (the hidden sections)', () => {
  it('a hidden section does not stand in the desktop menu and comes back when shown', () => {
    setVKSidebarMenuSectionVisible('audio', false);
    const root = mount({active: 'news', onSectionChange: vi.fn(), withLogout: true});
    expect(rowTitles(root)).not.toContain('Аудиозаписи');
    // the others keep their places
    expect(rowTitles(root)).toContain('Новости');

    // the section stays hidden until it is shown again — the page itself does not move
    setVKSidebarMenuSectionVisible('audio', true);
    expect(rowTitles(root)).toContain('Аудиозаписи');
  });

  it('a hidden section leaves the drawer too, the groups fold with their rows', () => {
    setVKSidebarMenuSectionVisible('news', false);
    const root = mount({active: 'messages', onSectionChange: vi.fn(), withLogout: true, variant: 'drawer'});
    expect(rowTitles(root)).not.toContain('Новости');
    expect(rowTitles(root)).toContain('Сообщения');
    expect(rowTitles(root)).toContain('Выйти');
  });

  it('hiding «Страница» takes the desktop row out, the drawer keeps its profile header', () => {
    setVKSidebarMenuSectionVisible('profile', false);
    const desktop = mount({active: 'news', onSectionChange: vi.fn(), withLogout: true});
    expect(rowTitles(desktop)).not.toContain('Страница');

    const drawer = mount({active: 'news', onSectionChange: vi.fn(), withLogout: true, variant: 'drawer'});
    expect(drawer.querySelector('.vk-menu-header-name')?.textContent).toBe('Иван Петров');
  });

  it('«Настройки» cannot be hidden — it is the way back into the settings', () => {
    setVKSidebarMenuSectionVisible('settings', false);
    const root = mount({active: 'settings', onSectionChange: vi.fn(), withLogout: true});
    expect(rowTitles(root)).toContain('Настройки');
  });
});

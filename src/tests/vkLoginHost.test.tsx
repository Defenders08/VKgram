import {afterEach, describe, expect, it, vi} from 'vitest';

import {mountVKLoginFlow} from '@/vkgram/pages/VKLoginHost';
import {disposeActiveAuthFlow} from '@/pages/mountAuthFlow';
import {currentCard} from '@/pages/authFlow';

// the heavy host is out of scope: the test is about the VK page around it
vi.mock('@/pages/AuthCardsHost', () => ({
  default: () => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'auth-cards-host');
    return el;
  }
}));

const lightTheme = vi.hoisted(() => ({
  pinLightTheme: vi.fn(),
  unpinLightTheme: vi.fn()
}));

vi.mock('@/vkgram/lightTheme', () => lightTheme);

const htmlClasses = () => [...document.documentElement.classList];

afterEach(() => {
  // every mount returns its dispose; the «kept mounted» assertions run it themselves
  document.getElementById('vkgram-login-root')?.remove();
  document.getElementById('vkgram-root')?.remove();
  document.documentElement.classList.remove('is-vkgram');
  vi.clearAllMocks();
});

describe('mountVKLoginFlow', () => {
  it('renders the VK page around the auth flow', () => {
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});

    const root = document.getElementById('vkgram-login-root');
    expect(root).not.toBeNull();
    expect(root!.className).toContain('vkgram');
    expect(root!.className).toContain('vk-login-page');

    const logo = root!.querySelector('.vk-header .vk-header-logo');
    expect(logo?.textContent).toBe('VKGRAM');

    expect(root!.querySelector('[data-testid="auth-cards-host"]')).not.toBeNull();

    expect(htmlClasses()).toContain('is-vkgram');
    expect(lightTheme.pinLightTheme).toHaveBeenCalled();
    expect(document.title).toBe('VKGRAM - Вход');

    dispose();
  });

  it('opens the flow on the card the auth state maps to', () => {
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});
    expect(currentCard()?.name).toBe('signIn');
    dispose();

    mountVKLoginFlow({_: 'authStatePassword'});
    expect(currentCard()).toEqual({name: 'password'});

    const sentCode = {_: 'authSentCode', phone_code_hash: 'hash'} as any;
    mountVKLoginFlow({_: 'authStateAuthCode', sentCode} as any);
    expect(currentCard()).toEqual({name: 'authCode', payload: sentCode});

    const data = {token: 't', dcId: 2, userId: '1', isTest: false} as any;
    mountVKLoginFlow({_: 'authStateSignImport', data} as any);
    expect(currentCard()).toEqual({name: 'signImport', payload: data});
  });

  it('tears the page down and gives the html flag back when no IM layout is up', () => {
    // a leftover auth page from another test disposes itself on the remount below
    // and restores its own (already lost) title — flush it before pinning the expectations
    disposeActiveAuthFlow();
    document.title = 'Предыдущая страница';
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});
    expect(document.getElementById('vkgram-login-root')).not.toBeNull();
    expect(document.title).toBe('VKGRAM - Вход');

    dispose();

    expect(document.getElementById('vkgram-login-root')).toBeNull();
    expect(document.title).toBe('Предыдущая страница');
    expect(htmlClasses()).not.toContain('is-vkgram');
    expect(lightTheme.unpinLightTheme).toHaveBeenCalled();
    expect(lightTheme.pinLightTheme).toHaveBeenCalledTimes(1);
  });

  it('leaves is-vkgram to the IM layout and re-holds the light theme pin for it', () => {
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});

    // bootstrapIm mounts the IM layout (its #vkgram-root) before the auth flow is disposed
    const imRoot = document.createElement('div');
    imRoot.id = 'vkgram-root';
    document.body.appendChild(imRoot);
    lightTheme.pinLightTheme.mockClear();

    dispose();

    expect(document.getElementById('vkgram-login-root')).toBeNull();
    expect(htmlClasses()).toContain('is-vkgram');
    // the layout's own pin was a no-op while the login page held one — held again on its behalf
    expect(lightTheme.pinLightTheme).toHaveBeenCalledTimes(1);
  });

  it('allows only one auth page at a time', () => {
    const first = mountVKLoginFlow({_: 'authStateSignIn'});
    const authCode = {phone_number: '+7', phone_code_hash: 'h'};
    const second = mountVKLoginFlow({_: 'authStateSignUp', authCode} as any);

    expect(document.querySelectorAll('#vkgram-login-root')).toHaveLength(1);
    expect(currentCard()?.name).toBe('signUp');

    second();
    // the first instance was already torn down by the remount
    expect(() => first()).not.toThrow();
    expect(document.getElementById('vkgram-login-root')).toBeNull();
  });
});

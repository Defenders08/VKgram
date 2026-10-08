import {afterEach, describe, expect, it, vi} from 'vitest';
import {addVKgramAccount} from '@/vkgram/accounts';

const mocks = vi.hoisted(() => ({
  getTotalAccounts: vi.fn(),
  hasSomeonePremium: vi.fn(),
  getOpenTabsCount: vi.fn(),
  isUsingPasscode: vi.fn(),
  changeAccount: vi.fn(),
  showAccountsLimitPopup: vi.fn()
}));

vi.mock('@lib/accounts/accountController', () => ({
  default: {getTotalAccounts: mocks.getTotalAccounts}
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    hasSomeonePremium: mocks.hasSomeonePremium,
    getOpenTabsCount: mocks.getOpenTabsCount
  }
}));

vi.mock('@lib/passcode/deferredIsUsingPasscode', () => ({
  default: {isUsingPasscode: mocks.isUsingPasscode}
}));

vi.mock('@lib/accounts/changeAccount', () => ({
  changeAccount: mocks.changeAccount
}));

vi.mock('@lib/accounts/getCurrentAccount', () => ({
  getCurrentAccount: () => 1
}));

vi.mock('@components/sidebarLeft/accountsLimitPopup', () => ({
  default: mocks.showAccountsLimitPopup
}));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('addVKgramAccount', () => {
  it('switches to the next free slot and remembers the previous account', async() => {
    mocks.getTotalAccounts.mockResolvedValue(1);
    mocks.hasSomeonePremium.mockResolvedValue(false);
    mocks.isUsingPasscode.mockResolvedValue(false);
    mocks.getOpenTabsCount.mockReturnValue(2);

    await addVKgramAccount();

    expect(mocks.changeAccount).toHaveBeenCalledWith(2, false);
    expect(localStorage.getItem('previous-account')).toBe('1');
    // same-tab reload: `should-animate-auth` stays unset on purpose — Web K's
    // enter animation would reveal Web K's own background under the splash
    expect(localStorage.getItem('should-animate-auth')).toBeNull();
  });

  it('on the free limit without premium shows the limit popup and stays', async() => {
    mocks.getTotalAccounts.mockResolvedValue(3);
    mocks.hasSomeonePremium.mockResolvedValue(false);

    await addVKgramAccount();

    expect(mocks.showAccountsLimitPopup).toHaveBeenCalledTimes(1);
    expect(mocks.changeAccount).not.toHaveBeenCalled();
  });

  it('does nothing on the account limit', async() => {
    mocks.getTotalAccounts.mockResolvedValue(4);

    await addVKgramAccount();

    expect(mocks.hasSomeonePremium).not.toHaveBeenCalled();
    expect(mocks.changeAccount).not.toHaveBeenCalled();
  });

  it('ctrl+click opens the new account in a new tab', async() => {
    mocks.getTotalAccounts.mockResolvedValue(1);
    mocks.hasSomeonePremium.mockResolvedValue(false);

    await addVKgramAccount(new MouseEvent('click', {ctrlKey: true}));

    expect(mocks.changeAccount).toHaveBeenCalledWith(2, true);
    // a new tab: no same-tab animation flag
    expect(localStorage.getItem('should-animate-auth')).toBeNull();
  });
});

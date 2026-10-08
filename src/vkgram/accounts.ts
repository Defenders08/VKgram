import AccountController from '@lib/accounts/accountController';
import apiManagerProxy from '@lib/apiManagerProxy';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import {changeAccount} from '@lib/accounts/changeAccount';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {MAX_ACCOUNTS, MAX_ACCOUNTS_FREE} from '@lib/accounts/constants';
import type {ActiveAccountNumber} from '@lib/accounts/types';
import {coverForSessionChange} from '@/vkgram/boot';

/**
 * «Добавить аккаунт»: VKgram's own entry into Web K's add-account flow — the
 * same limits (the free limit with Web K's own limit popup, the premium check)
 * and the same switch: `changeAccount` reloads the app into the auth of the
 * next free slot, the boot splash covers the reload. Web K's own entry
 * (`appSidebarLeft.addAccount`) also animates its shell away before the reload —
 * that part belongs to the Web K UI VKgram replaces (and reaches into its DOM),
 * so the flow is opened from here instead.
 */
export async function addVKgramAccount(e?: MouseEvent) {
  const totalAccounts = await AccountController.getTotalAccounts();
  if(totalAccounts >= MAX_ACCOUNTS) return;

  const hasSomeonePremium = await apiManagerProxy.hasSomeonePremium();
  if(totalAccounts === MAX_ACCOUNTS_FREE && !hasSomeonePremium) {
    const {default: showAccountsLimitPopup} = await import('@components/sidebarLeft/accountsLimitPopup');
    showAccountsLimitPopup();
    return;
  }

  localStorage.setItem('previous-account', getCurrentAccount() + '');

  const isUsingPasscode = await DeferredIsUsingPasscode.isUsingPasscode();
  const openTabs = apiManagerProxy.getOpenTabsCount();
  const newTab = e?.ctrlKey || e?.metaKey || (openTabs <= 1 && isUsingPasscode);

  // A new tab leaves this page as it is. In the same tab the page is about to reload into the next
  // slot's login: nothing of Web K (its wallpaper, its auth enter animation — `should-animate-auth` is
  // deliberately not set, that animation reveals Web K's own background) may show in between.
  const uncover = newTab ? undefined : coverForSessionChange();

  try {
    await changeAccount((totalAccounts + 1) as ActiveAccountNumber, newTab);
  } catch(err) {
    uncover?.();
    throw err;
  }
}

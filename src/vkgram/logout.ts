import rootScope from '@lib/rootScope';
import {coverForSessionChange} from '@/vkgram/boot';

/**
 * «Выйти»: Web K's own confirmation popup (the one `showLogOutPopup` shows —
 * the same popup, danger button, Escape / overlay close it), with VKgram's
 * words; on «Выйти» the session ends exactly as Web K ends it
 * (`apiManager.logOut`). Shared by the desktop header, the mobile menu and
 * «Настройки → Аккаунт → Выход».
 */
export async function confirmVKLogout() {
  const {default: confirmationPopup} = await import('@components/confirmationPopup');

  const button = {
    text: document.createTextNode('Выйти'),
    isDanger: true
  };

  try {
    await confirmationPopup({
      title: 'Выход',
      descriptionRaw: 'Вы действительно хотите выйти?',
      button,
      // the cancel button is given here too, so it reads «Отмена» whatever Web K's language is
      buttons: [button, {text: document.createTextNode('Отмена'), isCancel: true}]
    });
  } catch{
    // «Отмена», Escape or a click outside — nothing to do
    return;
  }

  // Web K tears its UI down before the login page mounts: the original Telegram background must not show
  // in between (the login page lifts this cover when it is on screen)
  const uncover = coverForSessionChange();

  try {
    await rootScope.managers.apiManager.logOut();
  } catch(err) {
    uncover();
    throw err;
  }
}

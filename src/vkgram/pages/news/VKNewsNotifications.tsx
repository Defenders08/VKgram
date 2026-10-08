import {createSignal, Show} from 'solid-js';
import {i18n} from '@lib/langPack';
import uiNotificationsManager from '@lib/uiNotificationsManager';
import {useAppSettings} from '@stores/appSettings';
import {toastNew} from '@components/toast';
import IS_NOTIFICATION_SUPPORTED from '@environment/notificationSupport';
import VKIcon from '@/vkgram/components/VKIcons';

/**
 * «Never miss a message! Enable notifications to stay updated.» — Telegram's
 * suggestion to turn the browser notifications on, as a card of «Новости».
 *
 * It is Web K's own suggestion (`sidebarLeft/notificationsSuggestion`): the
 * same text (Web K's language pack, so it reads in the language of the app),
 * the same browser permission request, the same «dismissed» flag
 * (`appSettings.notifications.suggested`) — closing the card here closes Web
 * K's one too, and the other way round. Not shown when the browser has no
 * notifications or they are already allowed.
 */
export default function VKNewsNotifications() {
  const [appSettings, setAppSettings] = useAppSettings();
  // the browser's answer is not reactive: it is read once and after a request
  const [permission, setPermission] = createSignal(IS_NOTIFICATION_SUPPORTED ? Notification.permission : 'denied');

  const isShown = () => IS_NOTIFICATION_SUPPORTED &&
    !appSettings.notifications?.suggested &&
    permission() !== 'granted';

  const dismiss = () => {
    setAppSettings('notifications', 'suggested', true);
    toastNew({langPackKey: 'Suggestion.Notifications.Dismissed'});
  };

  const enable = () => {
    Notification.requestPermission().then((result) => {
      setPermission(result);
      if(result === 'granted') {
        setAppSettings('notifications', 'suggested', true);
        uiNotificationsManager.onPushConditionsChange();
      } else if(result === 'denied') {
        // blocked in the browser: nothing more to ask here
        dismiss();
      }
    }, dismiss);
  };

  return (
    <Show when={isShown()}>
      <section class="vk-block vk-notify-card" aria-label="Уведомления">
        <span class="vk-notify-card-icon" aria-hidden="true">
          <VKIcon name="bell" size={22} />
        </span>
        <div class="vk-notify-card-text">
          <p class="vk-notify-card-title">{i18n('Suggestion.Notifications', [''])}</p>
          <p class="vk-notify-card-subtitle">{i18n('Suggestion.Notifications.Subtitle')}</p>
        </div>
        <button type="button" class="vk-button vk-notify-card-enable" onClick={enable}>
          Включить
        </button>
        <button type="button" class="vk-icon-button vk-notify-card-close" title="Закрыть" aria-label="Закрыть" onClick={dismiss}>
          <VKIcon name="close" size={16} />
        </button>
      </section>
    </Show>
  );
}

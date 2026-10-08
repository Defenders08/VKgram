import {createMemo, createSignal, Show} from 'solid-js';
import type {Birthday} from '@layer';
import I18n from '@lib/langPack';
import {createVKPrivacy, VK_PRIVACY_TYPE_TITLES} from '@/vkgram/privacy';
import VKBirthdayPrivacyModal from '@/vkgram/pages/profile/VKBirthdayPrivacyModal';
import VKBirthdayModal from '@/vkgram/pages/profile/VKBirthdayModal';

/**
 * Birthday row of «Моя страница»: the value, Web K's own birthday popup to
 * change it (it saves through appProfileManager.setMyBirthday, and the full
 * peer store brings the new date back here), and who can see it («Настроить»
 * opens that setting in a modal, on the spot).
 */
export default function VKProfileBirthday(props: {birthday?: Birthday}) {
  const privacy = createVKPrivacy('inputPrivacyKeyBirthday');
  const [isPrivacyOpen, setIsPrivacyOpen] = createSignal(false);
  const [isEditOpen, setIsEditOpen] = createSignal(false);

  const text = createMemo(() => {
    const value = props.birthday;
    if(!value) return;
    return new I18n.IntlDateElement({
      date: new Date(value.year ?? new Date().getFullYear(), value.month - 1, value.day),
      options: {day: 'numeric', month: 'long', year: value.year ? 'numeric' : undefined}
    }).element;
  });

  return (
    <div class="vk-profile-info-row">
      <dt>День рождения</dt>
      <dd>
        <span class={props.birthday ? undefined : 'vk-page-text-secondary'}>
          {text() ?? 'Не указан'}
        </span>
        {' '}
        <button type="button" class="vk-link-button" onClick={() => setIsEditOpen(true)}>
          {props.birthday ? 'Изменить' : 'Добавить'}
        </button>
        <Show when={privacy.type() !== undefined}>
          <div class="vk-page-text-secondary">
            {'Кто видит: ' + VK_PRIVACY_TYPE_TITLES[privacy.type()]}
            {privacy.exceptionsCount() ? ` (исключений: ${privacy.exceptionsCount()})` : ''}
            {' · '}
            <button
              type="button"
              class="vk-link-button"
              aria-haspopup="dialog"
              onClick={() => setIsPrivacyOpen(true)}
            >
              Настроить
            </button>
          </div>
        </Show>
        <Show when={isEditOpen()}>
          <VKBirthdayModal
            initial={props.birthday}
            privacy={privacy}
            onOpenPrivacy={() => {
              // one window at a time: Escape and Tab belong to the topmost one
              setIsEditOpen(false);
              setIsPrivacyOpen(true);
            }}
            onClose={() => setIsEditOpen(false)}
          />
        </Show>
        <Show when={isPrivacyOpen()}>
          <VKBirthdayPrivacyModal privacy={privacy} onClose={() => setIsPrivacyOpen(false)} />
        </Show>
      </dd>
    </div>
  );
}

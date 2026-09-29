import {createMemo, Show} from 'solid-js';
import type {Birthday} from '@layer';
import I18n from '@lib/langPack';
import {createVKPrivacy, VK_PRIVACY_TYPE_TITLES} from '@/vkgram/privacy';
import {openVKSettings} from '@/vkgram/pages/settings/route';

/**
 * Birthday row of «Моя страница»: the value, Web K's own birthday popup to
 * change it (it saves through appProfileManager.setMyBirthday, and the full
 * peer store brings the new date back here), and who can see it.
 */
export default function VKProfileBirthday(props: {birthday?: Birthday}) {
  const privacy = createVKPrivacy('inputPrivacyKeyBirthday');

  const text = createMemo(() => {
    const value = props.birthday;
    if(!value) return;
    return new I18n.IntlDateElement({
      date: new Date(value.year ?? new Date().getFullYear(), value.month - 1, value.day),
      options: {day: 'numeric', month: 'long', year: value.year ? 'numeric' : undefined}
    }).element;
  });

  const edit = async() => {
    const {default: showBirthdayPopup, saveMyBirthday} = await import('@components/popups/birthday');
    showBirthdayPopup({
      initialDate: props.birthday,
      fromProfile: true,
      onSave: saveMyBirthday
    });
  };

  return (
    <div class="vk-profile-info-row">
      <dt>День рождения</dt>
      <dd>
        <span class={props.birthday ? undefined : 'vk-page-text-secondary'}>
          {text() ?? 'Не указан'}
        </span>
        {' '}
        <button type="button" class="vk-link-button" onClick={edit}>
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
              onClick={() => openVKSettings({category: 'privacy', item: 'birthday'})}
            >
              Настроить
            </button>
          </div>
        </Show>
      </dd>
    </div>
  );
}

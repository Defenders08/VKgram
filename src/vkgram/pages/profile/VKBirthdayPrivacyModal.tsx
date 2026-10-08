import VKModal from '@/vkgram/components/VKModal';
import VKSettingsPrivacy from '@/vkgram/pages/settings/VKSettingsPrivacy';
import type {createVKPrivacy} from '@/vkgram/privacy';

/**
 * «Кто видит дату рождения» in a small modal — the same privacy control as
 * «Настройки → Приватность → Дата рождения», without leaving the page. A choice
 * is saved at once (appPrivacyManager, see createVKPrivacy), so there is
 * nothing to confirm: the only button closes the window. `privacy` is the
 * birthday row's own, so its «Кто видит: …» line follows the choice.
 */
export default function VKBirthdayPrivacyModal(props: {
  privacy: ReturnType<typeof createVKPrivacy>,
  onClose: () => void
}) {
  return (
    <VKModal title="Дата рождения" width={320} onClose={props.onClose}>
      <div class="vk-modal-body">
        <VKSettingsPrivacy
          privacyKey="inputPrivacyKeyBirthday"
          question="Кто видит мою дату рождения"
          privacy={props.privacy}
        />
        <p class="vk-page-text vk-page-text-secondary">Выбор сохраняется сразу.</p>
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button" onClick={props.onClose}>Готово</button>
      </div>
    </VKModal>
  );
}

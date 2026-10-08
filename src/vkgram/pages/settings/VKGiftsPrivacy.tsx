import {createSignal, For, Show} from 'solid-js';
import type {GlobalPrivacySettings} from '@layer';
import rootScope from '@lib/rootScope';
import {toastNew} from '@components/toast';
import VKModal from '@/vkgram/components/VKModal';
import VKSettingsPrivacy from '@/vkgram/pages/settings/VKSettingsPrivacy';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';

type DisallowFlag = keyof NonNullable<GlobalPrivacySettings['disallowed_gifts']>['pFlags'];

const GIFT_TYPE_TOGGLES: Array<{flag: DisallowFlag, title: string}> = [
  {flag: 'disallow_limited_stargifts', title: 'Лимитированные'},
  {flag: 'disallow_unlimited_stargifts', title: 'Не лимитированные'},
  {flag: 'disallow_unique_stargifts', title: 'Уникальные'},
  {flag: 'disallow_stargifts_from_channels', title: 'Подарки от каналов'},
  {flag: 'disallow_premium_gifts', title: 'Подарки с премиум-подпиской'}
];

/**
 * «Подарки» of the privacy settings, the whole flow of Web K's
 * `AppPrivacyGiftsTab` in the VKgram settings language: who sees the gifts on
 * the profile (`VKSettingsPrivacy`, appPrivacyManager underneath) and which
 * gift types are accepted (`setGlobalPrivacySettings` — the same call the Web K
 * tab makes when it closes). Like in the Web K tab, the gift-type toggles are
 * premium-gated: a change without premium reverts itself and opens the premium
 * popup.
 *
 * Rendered inline by «Настройки» and inside `VKGiftsPrivacyModal`.
 */
export default function VKGiftsPrivacy() {
  const [settings, setSettings] = createSignal<GlobalPrivacySettings>();
  const [saving, setSaving] = createSignal(false);

  rootScope.managers.appPrivacyManager.getGlobalPrivacySettings().then(setSettings);

  const save = async(next: GlobalPrivacySettings) => {
    setSaving(true);
    try {
      setSettings(await rootScope.managers.appPrivacyManager.setGlobalPrivacySettings(next));
    } catch(err) {
      console.error('VKgram: setGlobalPrivacySettings failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setSaving(false);
    }
  };

  const disallowed = () => settings()?.disallowed_gifts?.pFlags ?? {};

  const setTypeAccepted = (flag: DisallowFlag, accepted: boolean) => {
    const current = settings();
    if(!current || saving()) return;

    // the gift types are a premium feature, as in the Web K tab: any change
    // without premium is dropped and the premium popup opens instead
    if(!rootScope.premium) {
      import('@components/popups/premium').then(({default: showPremiumPopup}) => showPremiumPopup());
      return;
    }

    const disallowedGifts = {
      _: 'disallowedGiftsSettings' as const,
      pFlags: {...disallowed(), [flag]: accepted ? undefined : true as const}
    };
    const hasAnyDisallow = Object.values(disallowedGifts.pFlags).some(Boolean);

    save({
      ...current,
      disallowed_gifts: hasAnyDisallow ? disallowedGifts : undefined
    });
  };

  return (
    <div class="vk-gifts-privacy">
      <VKSettingsPrivacy privacyKey="inputPrivacyKeyStarGiftsAutoSave" question="Чьи подарки показываются в моём профиле" />

      <Show when={settings()}>
        <fieldset class="vk-settings-fieldset" disabled={saving()}>
          <legend class="vk-settings-legend">Какие подарки принимать</legend>
          <For each={GIFT_TYPE_TOGGLES}>
            {({flag, title}) => (
              <Choice
                type="checkbox"
                checked={!disallowed()[flag]}
                onChange={(checked) => setTypeAccepted(flag, checked)}
              >
                {title}
              </Choice>
            )}
          </For>
          <p class="vk-settings-caption vk-page-text-secondary">
            Подарки непринятых типов не появятся в профиле.
          </p>
        </fieldset>
      </Show>
    </div>
  );
}

/**
 * The same settings in a `VKModal` — the way the «Настройки» link of the
 * profile's gifts block opens them. «Готово» closes: every change has already
 * been saved on the spot.
 */
export function VKGiftsPrivacyModal(props: {onClose: () => void}) {
  return (
    <VKModal title="Подарки" width={420} onClose={props.onClose}>
      <div class="vk-modal-body">
        <VKGiftsPrivacy />
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button" onClick={props.onClose}>Готово</button>
      </div>
    </VKModal>
  );
}

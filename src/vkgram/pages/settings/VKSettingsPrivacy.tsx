import {createUniqueId, For, Show} from 'solid-js';
import {createVKPrivacy, PrivacyType, VK_PRIVACY_TYPE_TITLES, VKPrivacyKey} from '@/vkgram/privacy';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';

const TYPES = [PrivacyType.Everybody, PrivacyType.Contacts, PrivacyType.Nobody];

/**
 * «Кто может видеть …» for one Telegram privacy key — appPrivacyManager
 * underneath, the user's exceptions are kept (see createVKPrivacy). The
 * options are the same `Choice` radios as in the feed settings. A host that
 * already reads the same key (the birthday row) hands over its `privacy`, so
 * it shows the change at once and the key is not loaded twice.
 */
export default function VKSettingsPrivacy(props: {
  privacyKey: VKPrivacyKey,
  question: string,
  privacy?: ReturnType<typeof createVKPrivacy>
}) {
  const privacy = props.privacy ?? createVKPrivacy(props.privacyKey);
  const name = createUniqueId();

  return (
    <Show when={privacy.rules()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      {/* keyed by the rules array: a failed save hands back a fresh copy and
          the radios are rebuilt from the real value */}
      <Show when={privacy.rules()} keyed>
        {(_rules) => (
          <fieldset class="vk-settings-fieldset" disabled={!privacy.isSimple() || privacy.saving()}>
            <legend class="vk-settings-legend">{props.question}</legend>
            <For each={TYPES}>
              {(type) => (
                <Choice
                  type="radio"
                  name={name}
                  checked={privacy.type() === type}
                  onChange={(checked) => checked && privacy.setType(type)}
                >
                  {VK_PRIVACY_TYPE_TITLES[type]}
                </Choice>
              )}
            </For>
          </fieldset>
        )}
      </Show>
      <Show when={privacy.exceptionsCount()}>
        <p class="vk-page-text vk-page-text-secondary">
          Исключений: {privacy.exceptionsCount()}. Они сохраняются при смене варианта; изменить их пока можно только в Telegram.
        </p>
      </Show>
      <Show when={!privacy.isSimple()}>
        <p class="vk-page-text vk-page-text-secondary">
          У этой настройки есть правила, которые VKgram пока не умеет изменять без потерь, поэтому здесь она только показывается.
        </p>
      </Show>
    </Show>
  );
}

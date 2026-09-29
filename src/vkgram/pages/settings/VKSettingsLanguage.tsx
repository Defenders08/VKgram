import {createResource, createSignal, createUniqueId, For, Show} from 'solid-js';
import rootScope from '@lib/rootScope';
import I18n from '@lib/langPack';

/**
 * Interface language — exactly what Web K's language tab does: the "web"
 * language list, then I18n.getLangPackAndApply, which re-renders every
 * translated string of the running app (no reload).
 */
export default function VKSettingsLanguage() {
  const name = createUniqueId();
  const [selected, setSelected] = createSignal<string>();

  const [languages] = createResource(async() => {
    // the same (cached) request as sidebarLeft/tabs/language.tsx
    const list = await rootScope.managers.apiManager.invokeApiCacheable('langpack.getLanguages', {lang_pack: 'web'});
    const langPack = await I18n.getCacheLangPackAndApply();
    setSelected(langPack.lang_code);
    return list;
  });

  const choose = (langCode: string) => {
    setSelected(langCode);
    // every listed language comes from the "web" pack
    I18n.getLangPackAndApply(langCode, true);
  };

  return (
    <Show when={languages()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      <fieldset class="vk-settings-fieldset">
        <legend class="vk-settings-legend">Язык интерфейса</legend>
        <For each={languages()}>
          {(language) => (
            <label class="vk-settings-radio">
              <input
                type="radio"
                name={name}
                checked={selected() === language.lang_code}
                onChange={(e) => e.currentTarget.checked && choose(language.lang_code)}
              />
              {language.native_name}
              <span class="vk-page-text-secondary"> — {language.name}</span>
            </label>
          )}
        </For>
      </fieldset>
      <p class="vk-page-text vk-page-text-secondary">
        Язык меняет строки Telegram внутри VKgram; собственные подписи VKgram пока только на русском.
      </p>
    </Show>
  );
}

import {createSignal, For, Show} from 'solid-js';
import {copyTextToClipboard} from '@helpers/clipboard';
import {exportVKConfig, getVKConfigSections, importVKConfig, resetVKConfig} from '@/vkgram/config';
// the screens that keep settings in the config: they register their sections when loaded,
// and export / import must know them whether or not their page was opened
import '@/vkgram/pages/news/settings';
import '@/vkgram/pages/messages/settings';
import '@/vkgram/pages/audio/settings';
import '@/vkgram/pages/profile/homeSettings';
import '@/vkgram/pages/settings/mobileNav';

type Status = {kind: 'ok' | 'error', text: string};

const pad = (value: number) => String(value).padStart(2, '0');

function fileName() {
  const now = new Date();
  return `vkgram-config-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

const configText = () => JSON.stringify(exportVKConfig(), null, 2);

/**
 * «Экспорт и импорт»: the settings of VKgram's own screens (the feed and dialog
 * settings, …) as one JSON file — to keep, to move to another browser, to bring
 * back after a clean-up. Importing replaces the sections the file has and checks
 * all of the file before it changes anything (see `vkgram/config.ts`).
 * Telegram's own settings (privacy, notifications, language, …) live in the
 * account, not here, and are not part of the file.
 */
export default function VKSettingsConfig() {
  const [status, setStatus] = createSignal<Status>();
  let fileInput: HTMLInputElement;

  const download = () => {
    const url = URL.createObjectURL(new Blob([configText()], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName();
    document.body.append(link);
    link.click();
    link.remove();
    // the download has started by now
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus({kind: 'ok', text: `Настройки сохранены в файл ${link.download}.`});
  };

  const copy = async() => {
    try {
      await copyTextToClipboard(configText());
      setStatus({kind: 'ok', text: 'Настройки скопированы в буфер обмена.'});
    } catch(err) {
      console.error('VKgram: failed to copy the config', err);
      setStatus({kind: 'error', text: 'Не удалось скопировать настройки.'});
    }
  };

  const onFile = async(e: Event & {currentTarget: HTMLInputElement}) => {
    const file = e.currentTarget.files?.[0];
    // the same file can be chosen again
    e.currentTarget.value = '';
    if(!file) return;

    let text: string;
    try {
      text = await file.text();
    } catch(err) {
      console.error('VKgram: failed to read the config file', err);
      setStatus({kind: 'error', text: 'Не удалось прочитать файл.'});
      return;
    }

    const result = importVKConfig(text);
    if('error' in result) {
      setStatus({kind: 'error', text: result.error});
      return;
    }

    setStatus({
      kind: 'ok',
      text: `Настройки загружены: ${result.applied.join(', ')}.` +
        (result.skipped.length ? ` Пропущено то, чего эта версия не знает: ${result.skipped.join(', ')}.` : '')
    });
  };

  const reset = () => {
    if(!window.confirm('Сбросить все настройки VKgram к стандартным? Это не затрагивает настройки аккаунта Telegram.')) return;
    resetVKConfig();
    setStatus({kind: 'ok', text: 'Настройки сброшены к стандартным.'});
  };

  return (
    <>
      <p class="vk-page-text">
        Настройки VKgram — те, что хранятся в этом браузере: сейчас
        {' '}<For each={getVKConfigSections()}>
          {(section, index) => <>{index() ? ', ' : ''}«{section.title}»</>}
        </For>
        {' '}— можно сохранить в файл и загрузить обратно, например в другом браузере.
        Настройки аккаунта Telegram (приватность, уведомления, язык) в файл не входят.
      </p>

      <div class="vk-config-actions">
        <button type="button" class="vk-button" onClick={download}>Скачать файл</button>
        <button type="button" class="vk-button vk-button-secondary" onClick={copy}>Скопировать</button>
        <button type="button" class="vk-button vk-button-secondary" onClick={() => fileInput.click()}>
          Загрузить из файла…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onFile}
        />
      </div>

      <Show when={status()}>
        {(current) => (
          <p
            class="vk-page-text vk-config-status"
            classList={{'is-error': current().kind === 'error'}}
            role={current().kind === 'error' ? 'alert' : 'status'}
          >
            {current().text}
          </p>
        )}
      </Show>

      <p class="vk-page-text vk-page-text-secondary">
        При загрузке заменяются только разделы, которые есть в файле; остальные остаются как были.
        Если файл повреждён, ничего не меняется.
      </p>

      <div class="vk-config-actions">
        <button type="button" class="vk-button vk-button-secondary" onClick={reset}>Сбросить все настройки VKgram</button>
      </div>
    </>
  );
}

import {createSignal, For, onMount, Show} from 'solid-js';
import {
  CacheUsage,
  clearCacheEntries,
  formatCacheSize,
  isCacheUsageSupported,
  measureCacheUsage
} from '@/vkgram/utils/cacheUsage';

type Part = {id: keyof CacheUsage, title: string};

// the pieces of «Кэш файлов», in the order of the bar
const FILE_PARTS: Part[] = [
  {id: 'images', title: 'Изображения'},
  {id: 'video', title: 'Видеофайлы'},
  {id: 'stickers', title: 'Стикеры и эмодзи'},
  {id: 'other', title: 'Прочее'}
];

async function confirmClear(title: string, description: string) {
  const {default: confirmationPopup} = await import('@components/confirmationPopup');

  const button = {
    text: document.createTextNode('Очистить'),
    isDanger: true
  };

  try {
    await confirmationPopup({
      title,
      descriptionRaw: description,
      button,
      // the cancel button is given here too, so it reads «Отмена» whatever Web K's language is
      buttons: [button, {text: document.createTextNode('Отмена'), isCancel: true}]
    });
    return true;
  } catch{
    // «Отмена», Escape or a click outside
    return false;
  }
}

/**
 * «Память» — what Web K keeps on this device (downloaded media and the pieces
 * of streamed video), counted from the browser's Cache Storage and drawn as the
 * page's own list: a bar of the parts, the rows with their sizes, a quiet
 * «Очистить» on each of the two caches. The numbers are an estimate, the way
 * Web K's own screen calls them. The age and the size limit of the cache stay
 * on Web K's screen (the button of the item).
 */
export default function VKSettingsStorage() {
  const [usage, setUsage] = createSignal<CacheUsage>();
  const [failed, setFailed] = createSignal(!isCacheUsageSupported());
  const [busy, setBusy] = createSignal(false);

  const refresh = async() => {
    try {
      setUsage(await measureCacheUsage());
      setFailed(false);
    } catch(err) {
      console.error('VKgram: measuring the cache failed', err);
      setFailed(true);
    }
  };

  onMount(() => {
    if(isCacheUsageSupported()) refresh();
  });

  const clear = async(which: 'files' | 'chunks') => {
    const isFiles = which === 'files';
    const confirmed = await confirmClear(
      isFiles ? 'Очистить кэш файлов' : 'Очистить кэш видеопотока',
      isFiles ?
        'Загруженные фото, видео и файлы удалятся с этого устройства. При необходимости они загрузятся снова.' :
        'Сохранённые фрагменты просмотренных видео удалятся с этого устройства.'
    );
    if(!confirmed) return;

    setBusy(true);
    try {
      await clearCacheEntries(which);
    } catch(err) {
      console.error('VKgram: clearing the cache failed', err);
    }
    await refresh();
    setBusy(false);
  };

  const total = () => (usage()?.files ?? 0) + (usage()?.chunks ?? 0);
  const share = (id: keyof CacheUsage) => (total() ? ((usage()?.[id] ?? 0) / total()) * 100 : 0);

  return (
    <Show
      when={!failed()}
      fallback={
        <p class="vk-page-text vk-page-text-secondary">
          Браузер не показывает, сколько места занимает кэш, поэтому здесь нечего показать.
        </p>
      }
    >
      <Show when={usage()} fallback={<p class="vk-page-text vk-page-text-secondary">Считаем…</p>}>
        {(data) => (
          <div class="vk-data-group" classList={{'is-busy': busy()}} aria-busy={busy()}>
            <div class="vk-data-total">
              <span class="vk-data-total-size">{formatCacheSize(total())}</span>
              <span class="vk-page-text-secondary"> занимает кэш на этом устройстве</span>
            </div>

            <div class="vk-data-bar" role="img" aria-label="Из чего состоит кэш">
              <For each={FILE_PARTS}>
                {(part) => <span class={`vk-data-bar-part is-${part.id}`} style={{width: `${share(part.id)}%`}} />}
              </For>
              <span class="vk-data-bar-part is-chunks" style={{width: `${share('chunks')}%`}} />
            </div>

            <ul class="vk-data-list">
              <li class="vk-data-row is-main">
                <div class="vk-data-row-text">
                  <span class="vk-data-row-title">Кэш файлов</span>
                  <span class="vk-page-text-secondary">{formatCacheSize(data().files)}</span>
                </div>
                <button
                  type="button"
                  class="vk-link-button"
                  disabled={busy() || !data().files}
                  onClick={() => clear('files')}
                >
                  Очистить
                </button>
              </li>
              <For each={FILE_PARTS}>
                {(part) => (
                  <li class="vk-data-row is-part">
                    <span class={`vk-data-dot is-${part.id}`} aria-hidden="true" />
                    <span class="vk-data-row-title">{part.title}</span>
                    <span class="vk-page-text-secondary">{formatCacheSize(data()[part.id])}</span>
                  </li>
                )}
              </For>
              <li class="vk-data-row is-main">
                <div class="vk-data-row-text">
                  <span class="vk-data-row-title">
                    <span class="vk-data-dot is-chunks" aria-hidden="true" />
                    Кэш видеопотока
                  </span>
                  <span class="vk-page-text-secondary">{formatCacheSize(data().chunks)}</span>
                </div>
                <button
                  type="button"
                  class="vk-link-button"
                  disabled={busy() || !data().chunks}
                  onClick={() => clear('chunks')}
                >
                  Очистить
                </button>
              </li>
            </ul>
          </div>
        )}
      </Show>
    </Show>
  );
}

import {createSignal, createUniqueId} from 'solid-js';
import {useAppSettings} from '@stores/appSettings';
import {oneDayInSeconds, oneMonthInSeconds, oneWeekInSeconds, oneYearInSeconds} from '@lib/constants';
import VKModal from '@/vkgram/components/VKModal';
import {openVKModal} from '@/vkgram/modals';
import {formatCacheSize} from '@/vkgram/utils/cacheUsage';

type Option = {value: number, label: string};

// «1 день» / «2 дня» / «5 дней»
const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if(mod10 === 1 && mod100 !== 11) return one;
  if(mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const days = (n: number): Option => ({value: oneDayInSeconds * n, label: `${n} ${plural(n, 'день', 'дня', 'дней')}`});
const weeks = (n: number): Option => ({value: oneWeekInSeconds * n, label: `${n} ${plural(n, 'неделя', 'недели', 'недель')}`});
const months = (n: number): Option => ({value: oneMonthInSeconds * n, label: `${n} ${plural(n, 'месяц', 'месяца', 'месяцев')}`});

// the steps of Web K's own slider (`storageQuota.tsx`), the same values — only the words are Russian
const TTL_OPTIONS: Option[] = [
  ...[1, 2, 3, 4, 5, 6].map(days),
  ...[1, 2, 3].map(weeks),
  ...[1, 2, 3, 4, 5, 6].map(months),
  {value: oneYearInSeconds, label: '1 год'}
];

const MB = 1024 * 1024;
const GB = MB * 1024;

const SIZE_OPTIONS: Option[] = [
  ...[100, 200, 300, 400, 500, 600, 700, 800, 900].map((mb) => ({value: mb * MB, label: formatCacheSize(mb * MB)})),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((gb) => ({value: gb * GB, label: formatCacheSize(gb * GB)})),
  // 0 is Web K's «let the browser decide»
  {value: 0, label: 'Авто'}
];

// the step the saved value falls on: the biggest one that is not above it
const ttlIndex = (ttl: number | undefined) => {
  const value = ttl || 0;
  let found = 0;
  for(let i = 1; i < TTL_OPTIONS.length; ++i) {
    if(TTL_OPTIONS[i].value <= value) found = i;
  }
  return found;
};

const sizeIndex = (size: number | undefined) => {
  const value = size || 0;
  if(value === 0) return SIZE_OPTIONS.length - 1;
  let found = 0;
  for(let i = 1; i < SIZE_OPTIONS.length - 1; ++i) {
    if(SIZE_OPTIONS[i].value <= value) found = i;
  }
  return found;
};

function Slider(props: {
  title: string,
  options: Option[],
  index: number,
  onChange: (index: number) => void
}) {
  const id = createUniqueId();
  return (
    <div class="vk-range">
      <div class="vk-range-head">
        <label id={`${id}-label`} for={id} class="vk-range-title">{props.title}</label>
        <span class="vk-range-value" aria-hidden="true">{props.options[props.index]?.label}</span>
      </div>
      <input
        id={id}
        type="range"
        class="vk-range-input"
        min={0}
        max={props.options.length - 1}
        step={1}
        value={props.index}
        aria-valuetext={props.options[props.index]?.label}
        style={{'--vk-range-fill': `${(props.index / (props.options.length - 1)) * 100}%`}}
        onInput={(e) => props.onChange(+e.currentTarget.value)}
      />
    </div>
  );
}

/**
 * «Срок и лимит кэша» — the two sliders of Web K's «Данные и память» (`storageQuota.tsx`) in a
 * `VKModal`: how old a cached file must be to be cleared, and how much the cache may take. They
 * write the same settings the Web K screen does (`appSettings.cacheTTL` in seconds,
 * `appSettings.cacheSize` in bytes, 0 = auto), so each change is applied at once.
 */
export default function VKCacheLimitModal(props: {onClose: () => void}) {
  const [settings, setSettings] = useAppSettings();
  const set = setSettings as (...args: any[]) => void;

  const [ttl, setTtl] = createSignal(ttlIndex((settings as any).cacheTTL));
  const [size, setSize] = createSignal(sizeIndex((settings as any).cacheSize));

  // written only when the person moves a slider — an odd value set on Web K's screen is not
  // rounded to a step just by opening this window
  const changeTtl = (index: number) => {
    setTtl(index);
    set('cacheTTL', TTL_OPTIONS[index].value);
  };

  const changeSize = (index: number) => {
    setSize(index);
    set('cacheSize', SIZE_OPTIONS[index].value);
  };

  return (
    <VKModal title="Срок и лимит кэша" width={420} closeOnBackdrop onClose={props.onClose}>
      <div class="vk-modal-body vk-cache-limit">
        <Slider title="Очищать кэш старше" options={TTL_OPTIONS} index={ttl()} onChange={changeTtl} />
        <Slider title="Лимит размера кэша" options={SIZE_OPTIONS} index={size()} onChange={changeSize} />
        <p class="vk-page-text vk-page-text-secondary">
          Изменения применяются сразу. Старые файлы удаляются, когда Telegram чистит кэш; при необходимости они загрузятся снова.
        </p>
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button" onClick={props.onClose}>Готово</button>
      </div>
    </VKModal>
  );
}

export const openVKCacheLimit = () => openVKModal((p) => <VKCacheLimitModal onClose={p.onClose} />);

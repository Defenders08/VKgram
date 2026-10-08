import {createMemo, createSignal, For, Show} from 'solid-js';
import type {Birthday} from '@layer';
import {toastNew} from '@components/toast';
import VKModal from '@/vkgram/components/VKModal';
import type {createVKPrivacy} from '@/vkgram/privacy';
import {VK_PRIVACY_TYPE_TITLES} from '@/vkgram/privacy';

const MIN_YEAR = 1900;

const MONTHS = Array.from({length: 12}, (_, index) => {
  const name = new Intl.DateTimeFormat('ru', {month: 'long'}).format(new Date(2000, index, 1));
  return name.charAt(0).toUpperCase() + name.slice(1);
});

const daysIn = (month: number, year?: number) => new Date(year ?? 2000, month, 0).getDate();

/**
 * «Дата рождения» in a `VKModal`: day, month and an optional year. The save is Web K's own
 * `saveMyBirthday` (what its birthday popup is given as `onSave`), so the date reaches the
 * server and the full peer store exactly as before. «Кто видит» opens the same privacy modal
 * as the row of the profile.
 */
export default function VKBirthdayModal(props: {
  initial?: Birthday,
  privacy?: ReturnType<typeof createVKPrivacy>,
  onOpenPrivacy?: () => void,
  onClose: () => void
}) {
  const [day, setDay] = createSignal(props.initial?.day ?? 0);
  const [month, setMonth] = createSignal(props.initial?.month ?? 0);
  const [year, setYear] = createSignal(props.initial?.year ?? 0);
  const [saving, setSaving] = createSignal(false);

  const years = Array.from({length: new Date().getFullYear() - MIN_YEAR + 1}, (_, index) => new Date().getFullYear() - index);
  const maxDay = createMemo(() => month() ? daysIn(month(), year() || undefined) : 31);

  // a day that no longer exists in the chosen month (31 → February) is dropped
  const pickMonth = (value: number) => {
    setMonth(value);
    if(day() > daysIn(value, year() || undefined)) setDay(0);
  };
  const pickYear = (value: number) => {
    setYear(value);
    if(month() && day() > daysIn(month(), value || undefined)) setDay(0);
  };

  const canSave = () => !!day() && !!month() && !saving();

  const save = async(e: Event) => {
    e.preventDefault();
    if(!canSave()) return;
    setSaving(true);
    try {
      const {saveMyBirthday} = await import('@components/popups/birthday');
      const birthday: Birthday = {_: 'birthday', day: day(), month: month()};
      if(year()) birthday.year = year();
      await saveMyBirthday(birthday);
      props.onClose();
    } catch(err) {
      console.error('VKgram: saving the birthday failed', err);
      toastNew({langPackKey: 'Error.AnError'});
      setSaving(false);
    }
  };

  return (
    <VKModal title="Дата рождения" width={380} closeDisabled={saving()} onClose={props.onClose}>
      <form class="vk-modal-form" onSubmit={save}>
        <div class="vk-modal-body vk-modal-fields">
          <div class="vk-field-row">
            <label for="vk-bd-day">День</label>
            <select id="vk-bd-day" class="vk-select" value={day()} onChange={(e) => setDay(+e.currentTarget.value)}>
              <option value="0" selected={!day()}>—</option>
              <For each={Array.from({length: maxDay()}, (_, index) => index + 1)}>
                {(value) => <option value={value} selected={value === day()}>{value}</option>}
              </For>
            </select>
          </div>
          <div class="vk-field-row">
            <label for="vk-bd-month">Месяц</label>
            <select id="vk-bd-month" class="vk-select" onChange={(e) => pickMonth(+e.currentTarget.value)}>
              <option value="0" selected={!month()}>—</option>
              <For each={MONTHS}>
                {(name, index) => <option value={index() + 1} selected={index() + 1 === month()}>{name}</option>}
              </For>
            </select>
          </div>
          <div class="vk-field-row">
            <label for="vk-bd-year">Год</label>
            <select id="vk-bd-year" class="vk-select" onChange={(e) => pickYear(+e.currentTarget.value)}>
              <option value="0" selected={!year()}>Не указывать</option>
              <For each={years}>
                {(value) => <option value={value} selected={value === year()}>{value}</option>}
              </For>
            </select>
          </div>
          <Show when={props.privacy && props.privacy.type() !== undefined}>
            <p class="vk-page-text vk-page-text-secondary">
              {'Кто видит: ' + VK_PRIVACY_TYPE_TITLES[props.privacy.type()]}
              {' · '}
              <button type="button" class="vk-link-button" onClick={props.onOpenPrivacy}>Настроить</button>
            </p>
          </Show>
        </div>
        <div class="vk-modal-foot">
          <button type="button" class="vk-button vk-button-secondary" disabled={saving()} onClick={props.onClose}>Отмена</button>
          <button type="submit" class="vk-button" disabled={!canSave()}>{saving() ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </form>
    </VKModal>
  );
}

import {createEffect, JSX, onCleanup, Show} from 'solid-js';
import VKIcon from '@/vkgram/components/VKIcons';
import {vkNewsSettings, updateVKNewsSettings, resetVKNewsSettings, isDefaultVKNewsSettings} from '@/vkgram/pages/news/settings';

/** A checkbox / radio the VK way: the real input stays (keyboard, screen readers), the box is drawn next to it. */
export function Choice(props: {
  type: 'checkbox' | 'radio',
  name?: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  children: JSX.Element,
  // what the filter does to the channels of the open tab, in words («12 скрыто»)
  count?: string
}) {
  return (
    <label class="vk-check">
      <input
        type={props.type}
        name={props.name}
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
      />
      <span class="vk-check-box" aria-hidden="true" />
      <span class="vk-check-label">{props.children}</span>
      <Show when={props.count !== undefined}>
        <span class="vk-check-count">{props.count}</span>
      </Show>
    </label>
  );
}

/**
 * The content of the «Настройки ленты» panel — which channels the feed leaves
 * out (archive, notifications off) and whether that is only for «Все» or for
 * the folders too. Each filter says how many channels it hides («12 скрыто»);
 * when the filters hide most of the channels the panel says so and can switch
 * the muted filter off for now. Every change is applied at once — the feed is
 * built from the rules, nothing is hidden by styles. «Сбросить» brings the
 * defaults back.
 *
 * Shared by the dropdown at the right end of the tabs (`VKNewsSettings`, the
 * desktop side blocks) and the merged «Настроить» window of the mobile top bar
 * (`VKNewsCustomizeModal`): the markup of the dropdown stays the same.
 */
export function VKNewsSettingsPanel(props: {
  // the id of the panel (aria-labelledby of the filter group)
  id: string,
  // «in the feed X of Y»: what the rules leave of the open tab's channels (shown once known)
  channelCount?: number,
  scopeCount?: number,
  // how many channels of the open tab each filter takes out
  stats?: {archived: number, muted?: number},
  // the filters leave a few channels of many
  hidesMost?: boolean,
  // the muted filter is switched off for now («Показать все каналы»)
  isMutedShown?: boolean,
  // the muted filter is on, so it can be switched off for now
  canShowMuted?: boolean,
  onShowAllChannels?: () => void,
  onRestoreFilters?: () => void
}) {
  const settings = vkNewsSettings;
  const hasFilters = () => settings().hideArchived || settings().hideMuted;
  // «12 скрыто» while the filter works, «12 не скрыто» while it does not
  const countText = (count: number | undefined, isOn: boolean) => {
    return count === undefined ? undefined : `${count} ${isOn ? 'скрыто' : 'не скрыто'}`;
  };

  return (
    <>
      <div class="vk-news-settings-head">
        <span class="vk-news-settings-title">Настройки ленты</span>
        <button
          type="button"
          class="vk-link-button"
          disabled={isDefaultVKNewsSettings()}
          onClick={resetVKNewsSettings}
        >
          Сбросить
        </button>
      </div>

      <div role="group" aria-labelledby={`${props.id}-filters`}>
        <div id={`${props.id}-filters`} class="vk-news-settings-legend">Фильтры:</div>
        <Choice
          type="checkbox"
          checked={settings().hideArchived}
          onChange={(checked) => updateVKNewsSettings({hideArchived: checked})}
          count={countText(props.stats?.archived, settings().hideArchived)}
        >
          Не показывать архивные каналы
        </Choice>
        <Choice
          type="checkbox"
          checked={settings().hideMuted}
          onChange={(checked) => updateVKNewsSettings({hideMuted: checked})}
          count={countText(props.stats?.muted, settings().hideMuted && !props.isMutedShown)}
        >
          Не показывать заглушённые каналы
        </Choice>
        <Choice
          type="checkbox"
          checked={settings().hidePeople}
          onChange={(checked) => updateVKNewsSettings({hidePeople: checked})}
        >
          Не показывать людей в историях
        </Choice>
      </div>

      <fieldset class="vk-settings-fieldset" disabled={!hasFilters()}>
        <legend class="vk-news-settings-legend">Применять фильтры:</legend>
        <Choice
          type="radio"
          name="vk-news-scope"
          checked={settings().scope === 'main'}
          onChange={() => updateVKNewsSettings({scope: 'main'})}
        >
          Только в «Все»
        </Choice>
        <Choice
          type="radio"
          name="vk-news-scope"
          checked={settings().scope === 'all'}
          onChange={() => updateVKNewsSettings({scope: 'all'})}
        >
          Во всех папках
        </Choice>
      </fieldset>

      <Show when={props.scopeCount !== undefined}>
        <div class="vk-news-settings-note" classList={{'is-cut': props.channelCount !== props.scopeCount}}>
          В ленте {props.channelCount} из {props.scopeCount} каналов
        </div>
      </Show>

      <Show when={props.hidesMost}>
        <div class="vk-news-settings-note is-cut">
          Фильтры скрывают большинство каналов.{' '}
          <Show when={props.canShowMuted}>
            <button type="button" class="vk-link-button" onClick={() => props.onShowAllChannels?.()}>Показать все каналы</button>
          </Show>
        </div>
      </Show>

      <Show when={props.isMutedShown}>
        <div class="vk-news-settings-note">
          Заглушённые каналы показаны временно.{' '}
          <button type="button" class="vk-link-button" onClick={() => props.onRestoreFilters?.()}>Вернуть фильтр</button>
        </div>
      </Show>
    </>
  );
}

/**
 * «Настройки ленты»: the button at the right end of the tabs and the small
 * panel that drops from it — the content of the panel is `VKNewsSettingsPanel`.
 * The panel closes on a click outside and on Escape, the focus goes back to
 * the button.
 */
export default function VKNewsSettings(props: {
  id: string,
  isOpen: boolean,
  onOpenChange: (open: boolean) => void,
  // «in the feed X of Y»: what the rules leave of the open tab's channels (shown once known)
  channelCount?: number,
  scopeCount?: number,
  // how many channels of the open tab each filter takes out
  stats?: {archived: number, muted?: number},
  // the filters leave a few channels of many
  hidesMost?: boolean,
  // the muted filter is switched off for now («Показать все каналы»)
  isMutedShown?: boolean,
  // the muted filter is on, so it can be switched off for now
  canShowMuted?: boolean,
  onShowAllChannels?: () => void,
  onRestoreFilters?: () => void
}) {
  let root: HTMLDivElement;
  let button: HTMLButtonElement;

  createEffect(() => {
    if(!props.isOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if(!root.contains(e.target as Node)) props.onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'Escape' || !props.isOpen) return;
    e.stopPropagation();
    props.onOpenChange(false);
    button.focus();
  };

  return (
    <div ref={root} class="vk-news-settings-holder" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        class="vk-link-button vk-news-settings-button"
        title={isDefaultVKNewsSettings() ? undefined : 'Настройки отличаются от стандартных'}
        aria-expanded={props.isOpen}
        aria-controls={props.id}
        onClick={() => props.onOpenChange(!props.isOpen)}
      >
        <VKIcon name="settings" size={14} />
        <span>Настройки ленты</span>
      </button>

      <Show when={props.isOpen}>
        <div id={props.id} class="vk-news-settings" role="group" aria-label="Настройки ленты">
          <VKNewsSettingsPanel
            id={props.id}
            channelCount={props.channelCount}
            scopeCount={props.scopeCount}
            stats={props.stats}
            hidesMost={props.hidesMost}
            isMutedShown={props.isMutedShown}
            canShowMuted={props.canShowMuted}
            onShowAllChannels={props.onShowAllChannels}
            onRestoreFilters={props.onRestoreFilters}
          />
        </div>
      </Show>
    </div>
  );
}

import {createEffect, onCleanup, Show} from 'solid-js';
import VKIcon from '@/vkgram/components/VKIcons';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';
import {
  vkMessagesSettings,
  updateVKMessagesSettings,
  resetVKMessagesSettings,
  isDefaultVKMessagesSettings
} from '@/vkgram/pages/messages/settings';

/**
 * The content of the «Настройки диалогов» panel — which dialogs the list
 * leaves out (archive, notifications off, channels) and whether that is only
 * for «Все» or for the other tabs too. It looks and works like the panel of
 * «Настройки ленты» of «Новости» (the same classes). Each filter says how many
 * dialogs of the open tab it hides («12 скрыто»); every change is applied at
 * once; «Сбросить» brings the defaults back.
 *
 * Shared by the dropdown under the folder tabs (`VKMessagesSettings`, the
 * desktop side rail) and the merged «Настроить» window of the mobile top bar
 * (`VKMessagesCustomizeModal`): the markup of the dropdown stays the same.
 */
export function VKMessagesSettingsPanel(props: {
  // the id of the panel (aria-labelledby of the filter group)
  id: string,
  // the filters work in the open tab (they never do in «Архив»)
  applies: boolean,
  // «in the list X of Y»: what the rules leave of the open tab's dialogs (shown once known)
  dialogCount?: number,
  scopeCount?: number,
  // how many dialogs of the open tab each filter takes out
  stats?: {archived: number, muted?: number, channels: number}
}) {
  const settings = vkMessagesSettings;
  const hasFilters = () => settings().hideArchived || settings().hideMuted || settings().hideChannels;
  // «12 скрыто» while the filter works, «12 не скрыто» while it does not
  const countText = (count: number | undefined, isOn: boolean) => {
    return count === undefined ? undefined : `${count} ${isOn && props.applies ? 'скрыто' : 'не скрыто'}`;
  };

  return (
    <>
      <div class="vk-news-settings-head">
        <span class="vk-news-settings-title">Настройки диалогов</span>
        <button
          type="button"
          class="vk-link-button"
          disabled={isDefaultVKMessagesSettings()}
          onClick={resetVKMessagesSettings}
        >
          Сбросить
        </button>
      </div>

      <div role="group" aria-labelledby={`${props.id}-filters`}>
        <div id={`${props.id}-filters`} class="vk-news-settings-legend">Фильтры:</div>
        <Choice
          type="checkbox"
          checked={settings().hideArchived}
          onChange={(checked) => updateVKMessagesSettings({hideArchived: checked})}
          count={countText(props.stats?.archived, settings().hideArchived)}
        >
          Не показывать архивные диалоги
        </Choice>
        <Choice
          type="checkbox"
          checked={settings().hideMuted}
          onChange={(checked) => updateVKMessagesSettings({hideMuted: checked})}
          count={countText(props.stats?.muted, settings().hideMuted)}
        >
          Не показывать заглушённые диалоги
        </Choice>
        <Choice
          type="checkbox"
          checked={settings().hideChannels}
          onChange={(checked) => updateVKMessagesSettings({hideChannels: checked})}
          count={countText(props.stats?.channels, settings().hideChannels)}
        >
          Скрыть каналы
        </Choice>
      </div>

      <fieldset class="vk-settings-fieldset" disabled={!hasFilters()}>
        <legend class="vk-news-settings-legend">Применять фильтры:</legend>
        <Choice
          type="radio"
          name="vk-messages-scope"
          checked={settings().scope === 'main'}
          onChange={() => updateVKMessagesSettings({scope: 'main'})}
        >
          Только в «Все»
        </Choice>
        <Choice
          type="radio"
          name="vk-messages-scope"
          checked={settings().scope === 'all'}
          onChange={() => updateVKMessagesSettings({scope: 'all'})}
        >
          Во всех папках
        </Choice>
      </fieldset>

      <Show
        when={props.applies}
        fallback={<div class="vk-news-settings-note">В архиве фильтры не применяются</div>}
      >
        <Show when={props.scopeCount !== undefined}>
          <div class="vk-news-settings-note" classList={{'is-cut': props.dialogCount !== props.scopeCount}}>
            В списке {props.dialogCount} из {props.scopeCount} диалогов
          </div>
        </Show>
      </Show>
    </>
  );
}

/**
 * «Настройки диалогов»: the button under the folder tabs and the small panel
 * that drops from it — the content of the panel is `VKMessagesSettingsPanel`.
 * The panel closes on a click outside and on Escape, the focus goes back to
 * the button.
 */
export default function VKMessagesSettings(props: {
  id: string,
  isOpen: boolean,
  onOpenChange: (open: boolean) => void,
  // the filters work in the open tab (they never do in «Архив»)
  applies: boolean,
  // «in the list X of Y»: what the rules leave of the open tab's dialogs (shown once known)
  dialogCount?: number,
  scopeCount?: number,
  // how many dialogs of the open tab each filter takes out
  stats?: {archived: number, muted?: number, channels: number}
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
        title={isDefaultVKMessagesSettings() ? 'Настройки диалогов' : 'Настройки отличаются от стандартных'}
        aria-label="Настройки диалогов"
        aria-expanded={props.isOpen}
        aria-controls={props.id}
        onClick={() => props.onOpenChange(!props.isOpen)}
      >
        <VKIcon name="settings" size={14} />
        <span>Настройки диалогов</span>
      </button>

      <Show when={props.isOpen}>
        <div id={props.id} class="vk-news-settings" role="group" aria-label="Настройки диалогов">
          <VKMessagesSettingsPanel
            id={props.id}
            applies={props.applies}
            dialogCount={props.dialogCount}
            scopeCount={props.scopeCount}
            stats={props.stats}
          />
        </div>
      </Show>
    </div>
  );
}

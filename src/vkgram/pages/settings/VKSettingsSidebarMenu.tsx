import {For} from 'solid-js';
import VKIcon from '@/vkgram/components/VKIcons';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';
import {
  isDefaultVKSidebarMenuSettings,
  resetVKSidebarMenuSettings,
  setVKSidebarMenuSectionVisible,
  vkSidebarMenuSettings,
  VK_SIDEBAR_MENU_SECTIONS
} from '@/vkgram/pages/settings/sidebarMenu';

/**
 * «Левое меню» — the sections of the left menu as a list with a checkbox on
 * every row: a tick keeps the section in the menu, an empty one takes it out.
 * Drawn with the pieces of the page-blocks settings (`VKHomeBlocksSettings`) —
 * the glyph in a quiet square over the checkbox and the name — so every list
 * of settings reads the same. A hidden section stays in the list, dimmed, the
 * way a hidden block of the page does. Every change is applied at once;
 * «Сбросить» is dimmed while the choice is the default one.
 */
export default function VKSettingsSidebarMenu() {
  const isShown = (id: (typeof VK_SIDEBAR_MENU_SECTIONS)[number]['id']) =>
    !vkSidebarMenuSettings().hidden.includes(id);

  return (
    <div class="vk-settings-item vk-home-blocks vk-sidebar-menu">
      <p class="vk-page-text vk-page-text-secondary">
        Какие разделы стоят в левом меню — в списке на компьютере и в ☰ на телефоне.
        Скрытый раздел никуда не пропадает: его страница открывается по-прежнему.
      </p>

      <div class="vk-home-blocks-legend">Разделы меню</div>
      <ul class="vk-header-settings-blocks">
        <For each={VK_SIDEBAR_MENU_SECTIONS}>
          {(section) => (
            <li class="vk-header-settings-block" classList={{'is-hidden': !isShown(section.id)}}>
              <span class="vk-header-settings-block-icon" aria-hidden="true">
                <VKIcon name={section.icon} size={18} />
              </span>
              <Choice
                type="checkbox"
                checked={isShown(section.id)}
                onChange={(checked) => setVKSidebarMenuSectionVisible(section.id, checked)}
              >
                <span class="vk-header-settings-block-title">{section.title}</span>
              </Choice>
            </li>
          )}
        </For>
      </ul>

      <p class="vk-page-text vk-page-text-secondary">
        Пункт «Настройки» остаётся в меню всегда — это вход в этот экран.
      </p>

      <div class="vk-profile-actions">
        <button
          type="button"
          class="vk-button vk-button-secondary"
          disabled={isDefaultVKSidebarMenuSettings()}
          onClick={resetVKSidebarMenuSettings}
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}

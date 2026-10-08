import {For, Show} from 'solid-js';
import VKIcon from '@/vkgram/components/VKIcons';
import {getVKSection, VK_SECTIONS} from '@/vkgram/sections';
import {
  VK_MOBILE_NAV_DEFAULT,
  VK_MOBILE_NAV_MAX,
  VK_MOBILE_NAV_MIN,
  addVKMobileNavSection,
  moveVKMobileNavSection,
  removeVKMobileNavSection,
  resetVKMobileNavSettings,
  vkMobileNavSettings
} from '@/vkgram/pages/settings/mobileNav';

/**
 * «Навбар» — the making of the phone's bottom bar: the sections on it now,
 * in their order, then the rest one tap away from joining them. Drawn with
 * the pieces of the page-blocks settings (`VKHomeBlocksSettings`) — the glyph
 * in a quiet square, the name in the link color, «выше» / «ниже» beside it —
 * so every list of settings reads the same. Every change is applied at once;
 * «Сбросить» is dimmed while the choice is the default one.
 */
export default function VKSettingsMobileNav() {
  const selected = () => vkMobileNavSettings().sections;
  const available = () => VK_SECTIONS.filter((section) => !selected().includes(section.id));
  const canAdd = () => selected().length < VK_MOBILE_NAV_MAX;
  const canRemove = () => selected().length > VK_MOBILE_NAV_MIN;
  const isDefault = () => {
    const sections = selected();
    return sections.length === VK_MOBILE_NAV_DEFAULT.length &&
      sections.every((id, index) => id === VK_MOBILE_NAV_DEFAULT[index]);
  };

  return (
    <div class="vk-settings-item vk-home-blocks">
      <p class="vk-page-text vk-page-text-secondary">
        Кнопки нижней панели на телефоне: какие разделы на ней и в каком порядке.
        От {VK_MOBILE_NAV_MIN} до {VK_MOBILE_NAV_MAX}, остальные остаются в меню ☰ шапки.
      </p>

      <div class="vk-home-blocks-legend">Разделы на панели</div>
      <ul class="vk-header-settings-blocks">
        <For each={selected()}>
          {(id, index) => {
            const section = getVKSection(id)!;
            return (
              <li class="vk-header-settings-block">
                <span class="vk-header-settings-block-icon" aria-hidden="true">
                  <VKIcon name={section.icon} size={18} />
                </span>
                <span class="vk-header-settings-block-info">
                  <span class="vk-header-settings-block-title">{section.title}</span>
                </span>
                <button
                  type="button"
                  class="vk-header-settings-icon"
                  aria-label={`Поднять выше: ${section.title}`}
                  title="Выше"
                  disabled={index() === 0}
                  onClick={() => moveVKMobileNavSection(id, -1)}
                >
                  <VKIcon name="up" size={14} />
                </button>
                <button
                  type="button"
                  class="vk-header-settings-icon vk-header-settings-down"
                  aria-label={`Опустить ниже: ${section.title}`}
                  title="Ниже"
                  disabled={index() === selected().length - 1}
                  onClick={() => moveVKMobileNavSection(id, 1)}
                >
                  <VKIcon name="up" size={14} />
                </button>
                <button
                  type="button"
                  class="vk-header-settings-icon"
                  aria-label={`Убрать с панели: ${section.title}`}
                  title="Убрать"
                  disabled={!canRemove()}
                  onClick={() => removeVKMobileNavSection(id)}
                >
                  <VKIcon name="close" size={14} />
                </button>
              </li>
            );
          }}
        </For>
      </ul>

      <Show when={available().length}>
        <div class="vk-home-blocks-legend vk-header-settings-add-legend">Доступные разделы</div>
        <ul class="vk-header-settings-blocks">
          <For each={available()}>
            {(section) => (
              <li class="vk-header-settings-block">
                <span class="vk-header-settings-block-icon" aria-hidden="true">
                  <VKIcon name={section.icon} size={18} />
                </span>
                <span class="vk-header-settings-block-info">
                  <span class="vk-header-settings-block-title">{section.title}</span>
                </span>
                <button
                  type="button"
                  class="vk-header-settings-icon"
                  aria-label={`Добавить на панель: ${section.title}`}
                  title="Добавить"
                  disabled={!canAdd()}
                  onClick={() => addVKMobileNavSection(section.id)}
                >
                  <VKIcon name="plus" size={14} />
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <p class="vk-page-text vk-page-text-secondary">
        Непрочитанные сообщения считаются на кнопке «Сообщения», где бы она ни стояла.
      </p>

      <div class="vk-profile-actions">
        <button
          type="button"
          class="vk-button vk-button-secondary"
          disabled={isDefault()}
          onClick={resetVKMobileNavSettings}
        >
          Сбросить
        </button>
      </div>
    </div>
  );
}

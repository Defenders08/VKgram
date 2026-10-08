import {createRoot, createSignal} from 'solid-js';
import {openVKSection} from '@/vkgram/sections';

/**
 * Local navigation of «Настройки»: the tab of the section, inside the same
 * content area — the panel shows all of the category's items at once, so a
 * category is all there is to address. Kept at module level so it survives a
 * desktop ↔ mobile switch (the page is re-mounted) and so other pages can
 * deep-link into it.
 */
export type VKSettingsRoute = {
  category?: string
};

const [route, setRoute] = createRoot(() => createSignal<VKSettingsRoute>({}));

export {route as vkSettingsRoute, setRoute as setVKSettingsRoute};

export function openVKSettings(target: VKSettingsRoute) {
  setRoute(target);
  openVKSection('settings');
}

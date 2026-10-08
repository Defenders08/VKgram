import themeController from '@helpers/themeController';

let unpin: (() => void) | null = null;

/**
 * VKgram is a light design: while it is active, the theme controller resolves
 * every theme to «day» — the system's dark mode, the burger-menu toggle and
 * the settings radio included never bring the night palette back.
 *
 * The user's own theme choice is not overwritten: the controller is only
 * given its resolution back on unmount, so the messenger without VKgram
 * follows the stored setting (night included) as before.
 */
export function pinLightTheme() {
  if(unpin) return;

  // the night state is read BEFORE the resolution is pinned: afterwards the
  // controller always resolves to «day» and would never admit it was night
  const wasNight = themeController.isNight();

  const original = themeController.getResolvedThemeName.bind(themeController);
  themeController.getResolvedThemeName = () => 'day';

  // a night that was applied before the mount is repainted right away
  if(wasNight) themeController.setTheme();

  unpin = () => {
    themeController.getResolvedThemeName = original;
    unpin = null;
  };
}

export function unpinLightTheme() {
  unpin?.();
}

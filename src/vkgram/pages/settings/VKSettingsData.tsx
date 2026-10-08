import {onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';
import rootScope from '@lib/rootScope';
import EventListenerBase from '@helpers/eventListenerBase';

/**
 * «Данные и память»: Web K's own Data & Storage screen (`sidebarLeft/tabs/
 * dataAndStorage`) embedded into the VKgram settings — the real component over
 * the same stores, nothing is copied. The screen needs a tab object, so a shim
 * answers for one: the auto-download rows (Photos / Videos / Files) open Web
 * K's own sub-screens in `showSettingsSliderPopup` — the popup Web K itself
 * puts its tabs in — and the storage quota saves its pending changes on the
 * tab's `destroy` event, which the panel dispatches when it goes away.
 *
 * The heavy graph (the screen, the providers) is imported on mount, not at the
 * settings' module load.
 */
export default function VKSettingsData() {
  let container!: HTMLDivElement;

  onMount(() => {
    let dispose: (() => void) | undefined;
    const eventListener = new EventListenerBase<{destroy: () => void}>();

    Promise.all([
      import('@components/sidebarLeft/tabs/dataAndStorage'),
      import('@components/solidJsTabs/superTabProvider'),
      import('@lib/solidjs/hotReloadGuardProvider')
    ]).then(([{default: DataAndStorage}, {SuperTabProvider}, {default: SolidJSHotReloadGuardProvider}]) => {
      const self = {
        eventListener,
        slider: {
          createTab: (constructable: any) => ({
            open: async(payload?: unknown) => {
              const {default: showSettingsSliderPopup} = await import('@components/sidebarLeft/settingsSliderPopup');
              showSettingsSliderPopup(rootScope.managers).createTab(constructable).open(payload);
            }
          })
        }
      };

      dispose = render(() => (
        <SolidJSHotReloadGuardProvider>
          <SuperTabProvider self={self as any}>
            <DataAndStorage />
          </SuperTabProvider>
        </SolidJSHotReloadGuardProvider>
      ), container);
    });

    onCleanup(() => {
      // the quota controls save while their DOM is still alive
      eventListener.dispatchEvent('destroy');
      dispose?.();
    });
  });

  return <div class="vk-settings-embed" ref={container} />;
}

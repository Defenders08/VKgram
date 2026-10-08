import {children, createEffect, For, JSX, on, onMount, Show} from 'solid-js';
import formatNumber from '@helpers/number/formatNumber';

export type VKTabItem<T extends string> = {
  id: T,
  title: string,
  // a number after the title
  count?: number
};

/**
 * Tabs of a VKgram block (the `.vk-tabs` / `.vk-tab` look of the channel's
 * «Лента»): a tablist with the arrow keys moving between the tabs. The page
 * owns the panel — it gives it `id="<idPrefix>-panel-<tab id>"` and
 * `aria-labelledby="<idPrefix>-tab-<tab id>"`. Tabs that do not fit wrap to the
 * next line; `actions` stays at the right end of the strip. `onAdd` puts a «+»
 * button after the last tab (`addInFooter`: at the right end of the row under the strip;
 * `addPinned`: pinned at the right end of the strip itself — it does not scroll away
 * with the tabs, the way the mobile strip of «Новостей» keeps it).
 */
export default function VKTabs<T extends string>(props: {
  tabs: VKTabItem<T>[],
  active: T,
  onChange: (id: T) => void,
  idPrefix: string,
  label?: string,
  // a control at the right end of the strip (it is not a tab)
  actions?: JSX.Element,
  // «+» right after the last tab (it is not a tab either): what it does and how it is called
  onAdd?: () => void,
  addLabel?: string,
  // the side-block look: «+» is not a tab of the strip but stands at the right end of the row under it
  // (the row of `actions`, or a row of its own), like «Настройки ленты» and its «+»
  addInFooter?: boolean,
  // the mobile look: «+» is pinned at the right end of the strip (in the place of `actions`)
  // while the tabs scroll sideways under it
  addPinned?: boolean
}) {
  // `props.actions` is a getter that builds the component on every read: reading it twice
  // (`when` + the content) made two instances, and the one that was never in the DOM kept its
  // own outside-click listener (its `contains` is always false) and closed the panel.
  // `children` resolves it once.
  const actions = children(() => props.actions);

  // the tab the Tab key lands on: the open one, or the first when none of this strip is open
  const focusId = () => props.tabs.some((tab) => tab.id === props.active) ? props.active : props.tabs[0]?.id;

  // a strip that does not fit scrolls sideways: the open tab is brought into view (to the middle)
  let list!: HTMLDivElement;
  const revealActive = (smooth: boolean) => {
    if(!list || list.scrollWidth <= list.clientWidth) return;
    const tab = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if(!tab) return;
    const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
    list.scrollTo({left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto'});
  };
  onMount(() => revealActive(false));
  createEffect(on(() => props.active, () => queueMicrotask(() => revealActive(true)), {defer: true}));

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // the arrows walk the tabs; «+» is not one of them
    const focused = (e.target as HTMLElement).closest('[role="tab"]');
    if(!focused) return;
    e.preventDefault();
    // from the tab that has the focus: a strip whose tab is not the open one (a block next to
    // the main one) has no active tab to count from
    const index = props.tabs.findIndex((tab) => `${props.idPrefix}-tab-${tab.id}` === focused.id);
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = props.tabs[(index + step + props.tabs.length) % props.tabs.length];
    props.onChange(next.id);
    document.getElementById(`${props.idPrefix}-tab-${next.id}`)?.focus();
  };

  return (
    <div class="vk-tabs">
      <div ref={list} class="vk-tabs-list" role="tablist" aria-label={props.label} onKeyDown={onKeyDown}>
        <For each={props.tabs}>
          {(tab) => (
            <button
              type="button"
              id={`${props.idPrefix}-tab-${tab.id}`}
              class="vk-tab"
              classList={{'is-active': props.active === tab.id}}
              role="tab"
              aria-selected={props.active === tab.id}
              aria-controls={`${props.idPrefix}-panel-${tab.id}`}
              tabindex={focusId() === tab.id ? 0 : -1}
              onClick={() => props.onChange(tab.id)}
            >
              {tab.title}
              <Show when={tab.count}>
                <span class="vk-tab-count"> {formatNumber(tab.count, 1)}</span>
              </Show>
            </button>
          )}
        </For>
        <Show when={props.onAdd && !props.addInFooter && !props.addPinned}>
          <button
            type="button"
            class="vk-tab vk-tab-add"
            title={props.addLabel}
            aria-label={props.addLabel}
            onClick={() => props.onAdd?.()}
          >
            +
          </button>
        </Show>
      </div>
      <Show when={actions() || ((props.onAdd && props.addInFooter) || (props.onAdd && props.addPinned))}>
        <div class="vk-tabs-actions" classList={{'has-add': !!(props.onAdd && props.addInFooter)}}>
          {actions()}
          <Show when={props.onAdd && (props.addInFooter || props.addPinned)}>
            <button
              type="button"
              class="vk-tabs-add"
              title={props.addLabel}
              aria-label={props.addLabel}
              onClick={() => props.onAdd?.()}
            >
              +
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

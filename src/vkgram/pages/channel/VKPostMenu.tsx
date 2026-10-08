import {createSignal, For, JSX, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';
import VKIcon, {VKIconName} from '@/vkgram/components/VKIcons';

export type VKPostMenuItem = {
  icon: VKIconName,
  title: string,
  onClick: () => void | Promise<void>,
  danger?: boolean,
  // a divider is drawn above the item
  separator?: boolean
};

export type VKPostMenuOptions = {
  // where the menu opens: the cursor, or the ⋮ (the menu then hangs under it, right edges aligned)
  // `above`: the menu stands over the anchor (y is its top edge) instead of under it — for a button at the bottom
  anchor: {x: number, y: number, align: 'cursor' | 'right', above?: boolean},
  items: VKPostMenuItem[],
  // the row of quick reactions above the actions
  header?: () => JSX.Element,
  onClose?: () => void
};

const PHONE_QUERY = '(max-width: 600px)';
const EDGE = 8;

function Menu(props: VKPostMenuOptions & {close: () => void}) {
  let menuEl!: HTMLDivElement;
  const [position, setPosition] = createSignal<{left: number, top: number, maxHeight: number}>();
  const isPhone = window.matchMedia(PHONE_QUERY).matches;

  const place = () => {
    if(isPhone) return;
    const {width, height} = menuEl.getBoundingClientRect();
    const {x, y, align, above} = props.anchor;
    const maxHeight = window.innerHeight - EDGE * 2;
    const h = Math.min(height, maxHeight);

    let left = align === 'right' ? x - width : x;
    let top = y;
    if(above) top = Math.max(EDGE, y - h);
    // does not fit below: flip above the cursor / the button, or stick to the bottom edge
    else if(top + h > window.innerHeight - EDGE) top = Math.max(EDGE, Math.min(y - h, window.innerHeight - EDGE - h));
    if(left + width > window.innerWidth - EDGE) left = window.innerWidth - EDGE - width;
    if(left < EDGE) left = EDGE;
    setPosition({left, top, maxHeight});
  };

  const onPointerDown = (e: Event) => {
    if(menuEl.contains(e.target as Node)) return;
    props.close();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key === 'Escape') {
      e.stopPropagation();
      props.close();
    }
  };
  const onScroll = (e: Event) => {
    if(menuEl.contains(e.target as Node)) return;
    props.close();
  };

  onMount(() => {
    place();
    // the first item gets the focus, so the arrows work at once
    menuEl.querySelector<HTMLElement>('[role="menuitem"]')?.focus({preventScroll: true});
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', props.close);
    window.addEventListener('blur', props.close);
  });

  onCleanup(() => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', props.close);
    window.removeEventListener('blur', props.close);
  });

  // ↑ ↓ Home End move over the items
  const onMenuKeyDown = (e: KeyboardEvent) => {
    const items = [...menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    if(!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | undefined;
    if(e.key === 'ArrowDown') next = (index + 1) % items.length;
    else if(e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if(e.key === 'Home') next = 0;
    else if(e.key === 'End') next = items.length - 1;
    if(next === undefined) return;
    e.preventDefault();
    items[next].focus();
  };

  return (
    <>
      <Show when={isPhone}>
        <div class="vk-post-menu-backdrop" />
      </Show>
      <div
        ref={menuEl}
        class="vk-post-menu"
        classList={{'is-sheet': isPhone}}
        role="menu"
        style={position() ? {
          left: `${position()!.left}px`,
          top: `${position()!.top}px`,
          'max-height': `${position()!.maxHeight}px`
        } : {visibility: isPhone ? 'visible' : 'hidden'}}
        onKeyDown={onMenuKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        {props.header?.()}
        <For each={props.items}>
          {(item) => (
            <>
              <Show when={item.separator}>
                <div class="vk-post-menu-separator" role="separator" aria-hidden="true" />
              </Show>
              <button
                type="button"
                role="menuitem"
                class="vk-post-menu-item"
                classList={{'is-danger': item.danger}}
                onClick={() => {
                  props.close();
                  item.onClick();
                }}
              >
                <VKIcon name={item.icon} size={16} />
                <span>{item.title}</span>
              </button>
            </>
          )}
        </For>
      </div>
    </>
  );
}

/**
 * VKgram's own menu of a post: a card in the project's look (`var(--vk-*)`,
 * day and night), not Web K's `ButtonMenu`. On a wide screen it opens at the
 * cursor / under the ⋮ and stays inside the window; on a phone it is a sheet
 * from the bottom edge. Closes on Escape, a press outside, a scroll, a resize.
 * Returns the function that closes it.
 */
export function openVKPostMenu(options: VKPostMenuOptions) {
  const host = document.createElement('div');
  host.className = 'vk-post-menu-host';
  (document.querySelector('.vkgram') ?? document.body).append(host);

  let disposed = false;
  function close() {
    if(disposed) return;
    disposed = true;
    dispose?.();
    host.remove();
    options.onClose?.();
  }

  const dispose = render(() => <Menu {...options} close={close} />, host);
  return close;
}

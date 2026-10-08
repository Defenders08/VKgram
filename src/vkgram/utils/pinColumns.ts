/**
 * The right-hand columns of a page (the tab rails, the narrow column of a profile / channel) are
 * `position: sticky` under the header. A column taller than the window pinned by its top would hide
 * its lower part until the very end of the page — so such a column is pinned by its bottom instead:
 * `top` is lowered to `window height − column height − gap`, and the column scrolls with the page
 * until its end comes into view, then stays. A column that fits keeps `top` right under the header.
 */

const SELECTOR = '.vk-news-side, .vk-media-side, .vk-channels-side, .vk-friends-side, .vk-cols > .vk-col-side';
const GAP = 10;
const HEADER_FALLBACK = 42;

export default function pinColumns(root: HTMLElement): () => void {
  const observed = new Set<HTMLElement>();
  const resizer = new ResizeObserver(() => schedule());
  let frame = 0;
  let disposed = false;

  const headerHeight = () => {
    const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vk-header-height'));
    return Number.isFinite(value) ? value : HEADER_FALLBACK;
  };

  const update = () => {
    frame = 0;
    if(disposed) return;

    const columns = new Set(root.querySelectorAll<HTMLElement>(SELECTOR));
    for(const column of observed) {
      if(columns.has(column)) continue;
      resizer.unobserve(column);
      observed.delete(column);
    }

    const header = headerHeight();
    for(const column of columns) {
      if(!observed.has(column)) {
        observed.add(column);
        resizer.observe(column);
      }
      const top = Math.min(header, window.innerHeight - column.offsetHeight - GAP);
      column.style.top = top + 'px';
    }
  };

  function schedule() {
    if(!frame && !disposed) frame = requestAnimationFrame(update);
  }

  // pages come and go under `root`, and a column grows when its blocks load
  const mutations = new MutationObserver(schedule);
  mutations.observe(root, {childList: true, subtree: true});
  window.addEventListener('resize', schedule);
  update();

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    mutations.disconnect();
    resizer.disconnect();
    window.removeEventListener('resize', schedule);
    for(const column of observed) column.style.removeProperty('top');
    observed.clear();
  };
}

import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';

/**
 * Renders a long list a page at a time: the address book and the channel
 * subscriptions can hold thousands of rows, each with a Web K avatar, so only
 * the first `pageSize` are mounted and the next page comes when the sentinel
 * under the list scrolls near the viewport (IntersectionObserver — no polling,
 * no scroll listeners). The count starts over when `resetKey` changes (a new
 * search query).
 */
export default function createIncrementalList(options: {
  total: Accessor<number>,
  resetKey?: Accessor<unknown>,
  pageSize?: number
}) {
  const pageSize = options.pageSize ?? 40;
  const [count, setCount] = createSignal(pageSize);
  const [sentinel, setSentinel] = createSignal<HTMLElement>();

  if(options.resetKey) {
    createEffect(on(options.resetKey, () => setCount(pageSize), {defer: true}));
  }

  const hasMore = () => count() < options.total();

  createEffect(() => {
    const element = sentinel();
    if(!element || !hasMore()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) {
        setCount((current) => Math.min(current + pageSize, options.total()));
      }
    }, {rootMargin: '300px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return {
    /** how many rows to mount */
    count,
    hasMore,
    /** the ref of the empty element placed right under the rows */
    setSentinel
  };
}

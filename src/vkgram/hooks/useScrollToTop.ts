import {createEffect, createSignal, on, onCleanup} from 'solid-js';

// scrolled further than this, the «up» button is of use
const SHOW_AFTER = 240;

/**
 * «Наверх» of the header. Whatever scrolls in the content area is meant: the page of a
 * section, the history of an open dialog, the list of dialogs. The scrolled element is
 * remembered from its `scroll` event (those do not bubble, hence the capture listener on
 * the document), and the button is shown while that element is down the page. On desktop
 * the scroller of a page is the document itself (its target is the document, not an
 * element) — remembered as `'window'` and scrolled with `window.scrollTo`.
 */
export default function useScrollToTop(section: () => string | undefined) {
  const [visible, setVisible] = createSignal(false);
  // the window, or the inner pane (a dialog list, a chat history) that moved last
  let target: HTMLElement | 'window' | undefined;

  const onScroll = (event: Event) => {
    const element = event.target;
    if(element === document || element === document.documentElement) {
      target = 'window';
      setVisible(window.scrollY > SHOW_AFTER);
      return;
    }
    if(!(element instanceof HTMLElement) || !element.closest('.vk-content')) return;
    // two scrollers can be moving at once (a dialog list and a chat): the last one moved is the one meant
    target = element;
    setVisible(element.scrollTop > SHOW_AFTER);
  };

  document.addEventListener('scroll', onScroll, true);
  onCleanup(() => document.removeEventListener('scroll', onScroll, true));

  // another section is another page: nothing is scrolled yet
  createEffect(on(section, () => {
    target = undefined;
    setVisible(false);
  }, {defer: true}));

  const scrollToTop = () => {
    if(target === 'window') {
      window.scrollTo({top: 0, behavior: 'smooth'});
      return;
    }
    if(!target?.isConnected) {
      setVisible(false);
      return;
    }
    target.scrollTo({top: 0, behavior: 'smooth'});
  };

  return {visible, scrollToTop};
}

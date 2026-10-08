/**
 * Small animations for the things that appear, leave and change places (Web Animations API:
 * nothing is left in the styles, the element is as it was when the animation ends).
 * With «reduce motion» in the system everything happens at once.
 */

const EASE = 'cubic-bezier(.2, .7, .3, 1)';
const DURATION = 220;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// the sides that take room: they shrink with the height, so the neighbours do not jump at the end
const SPACING = ['marginTop', 'marginBottom', 'paddingTop', 'paddingBottom'] as const;

/** An element that was just added: grows from nothing (a row) and fades in. */
export function animateIn(element: HTMLElement, options: {grow?: boolean} = {}) {
  if(prefersReducedMotion()) return;

  const frames: Keyframe[] = [{opacity: 0, transform: 'translateY(-8px)'}, {opacity: 1, transform: 'none'}];
  if(options.grow) {
    const style = getComputedStyle(element);
    const from: Keyframe = {height: '0px', overflow: 'hidden'};
    const to: Keyframe = {height: `${element.offsetHeight}px`, overflow: 'hidden'};
    for(const side of SPACING) {
      from[side] = '0px';
      to[side] = style[side];
    }
    frames[0] = {...frames[0], ...from};
    frames[1] = {...frames[1], ...to};
  }
  element.animate(frames, {duration: DURATION, easing: EASE});
}

/**
 * An element that is about to be removed: fades and folds up. Resolves when it is gone from
 * the view — the caller takes it out of the page then (the element stays folded until it is).
 */
export async function animateOut(element: HTMLElement) {
  if(prefersReducedMotion()) return;

  const style = getComputedStyle(element);
  const from: Keyframe = {opacity: 1, height: `${element.offsetHeight}px`, overflow: 'hidden'};
  const to: Keyframe = {opacity: 0, height: '0px', overflow: 'hidden'};
  for(const side of SPACING) {
    from[side] = style[side];
    to[side] = '0px';
  }
  await element.animate([from, to], {duration: DURATION - 40, easing: 'ease-in', fill: 'forwards'}).finished;
}

/**
 * Moving things: reads where the elements are, runs `mutate` (which changes the order), and
 * slides every element that has moved from its old place to the new one.
 */
export function animateMove(query: () => HTMLElement[], mutate: () => void) {
  const before = new Map(query().map((element) => [element, element.getBoundingClientRect().top]));
  mutate();
  if(prefersReducedMotion()) return;

  for(const element of query()) {
    const top = before.get(element);
    if(top === undefined) continue;
    const shift = top - element.getBoundingClientRect().top;
    if(!shift) continue;
    element.animate([{transform: `translateY(${shift}px)`}, {transform: 'none'}], {duration: DURATION + 60, easing: EASE});
  }
}

/** A short frame of the accent colour round the element: «this is the one that changed». */
export function flash(element: HTMLElement) {
  if(prefersReducedMotion()) return;
  element.animate([
    {boxShadow: 'inset 0 0 0 2px rgba(81, 129, 184, .6)'},
    {boxShadow: 'inset 0 0 0 2px rgba(81, 129, 184, 0)'}
  ], {duration: 900, easing: 'ease-out'});
}

/**
 * The element lands where it belongs, coming from `sourceRect` — a viewport rect it
 * used to occupy (the circle just recorded in the composer flying into the chat).
 */
export function flyFromRect(element: HTMLElement, sourceRect: DOMRect, duration = 280) {
  if(prefersReducedMotion()) return;

  const end = element.getBoundingClientRect();
  const scale = end.width ? sourceRect.width / end.width : 1;
  const dx = sourceRect.left + sourceRect.width / 2 - (end.left + end.width / 2);
  const dy = sourceRect.top + sourceRect.height / 2 - (end.top + end.height / 2);
  if(!isFinite(scale) || scale <= 0 || (!dx && !dy && Math.abs(scale - 1) < .01)) return;

  element.animate([
    {transform: `translate(${dx}px, ${dy}px) scale(${scale})`},
    {transform: 'none'}
  ], {duration, easing: EASE});
}

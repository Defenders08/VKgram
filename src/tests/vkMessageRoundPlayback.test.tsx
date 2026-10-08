import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import MessageMedia from '@/vkgram/components/MessageMedia';
import {setRoundFlySource, takeRoundFlySource} from '@/vkgram/utils/roundMessageFly';

// синглтон прокси при импорте стартует крипто-воркер (fetch(undefined) в jsdom) — глушим
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

// VideoTsx is replaced with a stand-in that reproduces Web K's outgoing round
// element: `.media-round` with `data-is-outgoing` and a deferred onLoad that
// only the bubbles code (never mounted here) is supposed to fire.
const onLoad = vi.hoisted(() => vi.fn());
vi.mock('@components/wrappers/photoTsx', () => ({default: () => <div />}));
vi.mock('@components/wrappers/videoTsx', () => ({default: (props: any) => (
  <div
    class={props.class}
    ref={(el: HTMLElement) => {
      // like Web K's video.ts: only outgoing rounds carry the deferred onLoad
      const deferred = !!props.message?.pFlags?.is_outgoing;
      el.innerHTML = `<div class="media-round z-depth-1"${deferred ? ' data-is-outgoing="1"' : ''} data-mid="0.5"></div>`;
      if(deferred) (el.firstElementChild as any).onLoad = onLoad;
      props.ref?.(el);
    }}
  />
)}));
vi.mock('@components/wrappers/documentTsx', () => ({default: () => <div />}));
vi.mock('@components/emptyMediaListLoader', () => ({emptyMediaListLoaderFactory: vi.fn()}));
vi.mock('@/vkgram/pages/messages/openChat', () => ({openVKChat: vi.fn()}));
vi.mock('@appManagers/utils/docs/getAudioTitles', () => ({default: vi.fn()}));

const roundDoc = {
  _: 'document',
  id: 123,
  type: 'round',
  file_name: 'round.mp4',
  mime_type: 'video/webm',
  size: 1000,
  w: 400,
  h: 400,
  pFlags: {}
};

const roundMessage = (mid: number) => ({
  _: 'message',
  mid,
  peerId: '-1',
  date: 0,
  message: '',
  pFlags: {out: true, is_outgoing: true},
  media: {_: 'messageMediaDocument', document: roundDoc}
}) as any;

const dispose: (() => void)[] = [];
beforeEach(() => {
  // jsdom has neither matchMedia (flyFromRect asks for reduced motion) nor WAAPI
  (window as any).matchMedia ??= vi.fn().mockReturnValue({matches: false});
});
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  onLoad.mockClear();
  // drop a flight left over from the test before
  takeRoundFlySource('none' as unknown as PeerId);
});

const mount = (message: any) => {
  dispose.push(render(() => <MessageMedia message={message} />, document.body));
  return document.body;
};

describe('outgoing round video player wiring', () => {
  it('fires the deferred onLoad once the sent circle has a real mid', () => {
    const root = mount(roundMessage(100));
    const round = root.querySelector<HTMLElement>('.media-round');

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(true);
    expect(round!.dataset.isOutgoing).toBeUndefined();
    expect(round!.dataset.mid).toBe('100');
  });

  it('keeps the player deferred while the circle is still uploading', () => {
    mount(roundMessage(1759650000.5)); // a temp mid is fractional
    const round = document.querySelector<HTMLElement>('.media-round');

    expect(onLoad).not.toHaveBeenCalled();
    expect(round!.dataset.isOutgoing).toBe('1');
  });

  it('leaves incoming circles to Web K which wires them itself', () => {
    const message = roundMessage(101);
    message.pFlags = {};
    mount(message);

    expect(onLoad).not.toHaveBeenCalled();
    const round = document.querySelector<HTMLElement>('.media-round')!;
    // no deferred wiring in the first place, and the component left it alone
    expect(round.dataset.isOutgoing).toBeUndefined();
    expect(round.dataset.mid).toBe('0.5');
  });

  it('flies the just-recorded circle from the composer preview into the chat', async() => {
    // jsdom has no Web Animations API
    const animate = vi.fn();
    (HTMLElement.prototype as any).animate = animate;

    setRoundFlySource('-1' as unknown as PeerId, new DOMRect(100, 300, 160, 160));
    mount(roundMessage(102));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(animate).toHaveBeenCalledTimes(1);
    const [frames] = animate.mock.calls[0];
    // starts over the preview's place (jsdom rects are 0×0 → the shift equals the
    // source rect's center), settles at none
    expect(String(frames[0].transform)).toContain('translate(');
    expect(frames[1].transform).toBe('none');

    delete (HTMLElement.prototype as any).animate;
  });

  it('does not fly a circle that was not just recorded', async() => {
    const animate = vi.fn();
    (HTMLElement.prototype as any).animate = animate;

    mount(roundMessage(103));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(animate).not.toHaveBeenCalled();

    delete (HTMLElement.prototype as any).animate;
  });

  it('never takes a flight left over from another chat', async() => {
    const animate = vi.fn();
    (HTMLElement.prototype as any).animate = animate;

    setRoundFlySource('-2' as unknown as PeerId, new DOMRect(0, 0, 160, 160));
    mount(roundMessage(104));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    expect(animate).not.toHaveBeenCalled();

    delete (HTMLElement.prototype as any).animate;
  });
});

import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import VKComposer from '@/vkgram/components/VKComposer';
import {extractRich} from '@/vkgram/utils/richEditor';

const managers = vi.hoisted(() => ({
  appMessagesManager: {
    canSendToPeer: vi.fn(async() => true),
    // ..._args: the tests read mock.calls[0][0], so the send fns take args
    sendText: vi.fn(async(..._args: unknown[]) => ({})),
    sendFile: vi.fn(async(..._args: unknown[]) => ({})),
    sendGrouped: vi.fn(async(..._args: unknown[]) => ({})),
    editMessage: vi.fn(async(..._args: unknown[]) => ({})),
    setTyping: vi.fn(async(..._args: unknown[]) => ({}))
  },
  appDraftsManager: {
    getDraft: vi.fn(async() => undefined),
    setDraft: vi.fn(async() => ({})),
    clearDraft: vi.fn(async() => ({}))
  },
  appPeersManager: {
    getPeer: vi.fn(() => undefined)
  }
}));

vi.mock('@lib/rootScope', () => ({
  default: {managers, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

vi.mock('@lib/opusDecodeController', () => ({
  default: {decode: vi.fn(async() => ({blob: new Blob(['a'], {type: 'audio/ogg'})})), setKeepAlive: vi.fn()}
}));

// jsdom has no canvas — createPoster's webp probe throws at import time
vi.mock('@helpers/createPoster', () => ({
  createPosterFromMedia: vi.fn(async() => ({blob: new Blob(['p'], {type: 'image/jpeg'}), size: {width: 400, height: 400}}))
}));

vi.mock('@helpers/voiceRecorder/nativeVoiceRecorder', () => ({
  default: class {},
  isNativeVoiceRecorderSupported: () => false
}));

vi.mock('@helpers/videoRecorder/nativeVideoRecorder', () => ({
  default: class {},
  isNativeVideoRecorderSupported: () => false
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const mount = async() => {
  const root = document.body;
  dispose.push(render(() => <VKComposer peerId={'-1' as unknown as PeerId} />, root));
  await flush(); // rightsCanSend resolves, the real composer appears
  return root;
};

const editor = (root: HTMLElement) => root.querySelector('div.vk-composer-input') as HTMLDivElement;

// тип Набор символов с клавиатуры: текст в поле + уведомление об изменении
const type = async(el: HTMLDivElement, value: string) => {
  el.textContent = value;
  el.dispatchEvent(new Event('input', {bubbles: true}));
  await flush();
};

// выделить диапазон по суммарному смещению текста (DOM дробится спанами)
const select = (el: HTMLDivElement, start: number, end: number) => {
  el.focus();
  const locate = (target: number): {node: Node, offset: number} => {
    const nodes: Text[] = [];
    const walk = (node: Node) => {
      if(node.nodeType === Node.TEXT_NODE) { nodes.push(node as Text); return; }
      node.childNodes.forEach(walk);
    };
    walk(el);
    let acc = 0;
    for(const node of nodes) {
      if(target <= acc + node.length) return {node, offset: target - acc};
      acc += node.length;
    }
    const last = nodes[nodes.length - 1];
    return last ? {node: last, offset: last.length} : {node: el, offset: 0};
  };
  const from = locate(start);
  const to = locate(end);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
};

const menu = (root: HTMLElement) => root.querySelector('.vk-format-menu');
const menuButton = (root: HTMLElement, cls: string) => menu(root)!.querySelector(`.${cls}`) as HTMLButtonElement;

describe('VKComposer WYSIWYG formatting (the original\'s selection menu, in the VK look)', () => {
  it('appears over a rich selection and closes when the caret collapses', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, 'привет мир');

    select(el, 0, 6);
    expect(menu(root)).toBeTruthy();
    expect(menu(root)!.getAttribute('role')).toBe('toolbar');
    expect(menu(root)!.getAttribute('aria-label')).toBe('Форматирование');

    select(el, 6, 6);
    expect(menu(root)).toBeFalsy();
  });

  it('closes when the focus leaves the input, stays when it moves into the menu', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, 'привет мир');

    select(el, 0, 6);
    expect(menu(root)).toBeTruthy();

    // a click on a foreign button blurs the input (focusout bubbles)
    el.dispatchEvent(new FocusEvent('focusout', {bubbles: true, relatedTarget: root.querySelector('button[aria-label="Прикрепить"]')}));
    expect(menu(root)).toBeFalsy();

    select(el, 0, 6);
    // Tab into the menu itself must not close it
    const first = menu(root)!.querySelector('button')!;
    first.focus();
    el.dispatchEvent(new FocusEvent('focusout', {bubbles: true, relatedTarget: first}));
    expect(menu(root)).toBeTruthy();
  });

  it('applies real entities to the selection and keeps it selected for chaining', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, 'привет мир');

    select(el, 7, 10);
    menuButton(root, 'is-bold').click();
    await flush();

    // the format is real: a styled span, no markers anywhere
    const bold = el.querySelector('.vk-ent.is-bold')!;
    expect(bold.textContent).toBe('мир');
    expect(el.textContent).toBe('привет мир');
    // the selection lives on — the original chains bold and italic in one go
    expect(menu(root)).toBeTruthy();

    select(el, 7, 10);
    menuButton(root, 'is-italic').click();
    await flush();
    expect(el.querySelector('.vk-ent.is-italic')).toBeTruthy();
    const {text, entities} = extractRich(el);
    expect(text).toBe('привет мир');
    expect(entities.sort((a, b) => a.offset - b.offset)).toEqual([
      {_: 'messageEntityBold', offset: 7, length: 3},
      {_: 'messageEntityItalic', offset: 7, length: 3}
    ]);
  });

  it('toggles a format off when the selection is inside one span', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, 'привет мир');
    select(el, 7, 10);
    menuButton(root, 'is-bold').click();
    await flush();
    expect(el.querySelector('.vk-ent.is-bold')).toBeTruthy();

    select(el, 7, 10);
    menuButton(root, 'is-bold').click();
    await flush();
    expect(el.querySelector('.vk-ent.is-bold')).toBeFalsy();
    expect(el.textContent).toBe('привет мир');
  });

  it('puts the caret on https:// after wrapping a link', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, 'привет');

    select(el, 0, 6);
    const link = menu(root)!.querySelector('button[aria-label^="Ссылка"]') as HTMLButtonElement;
    link.click();
    await flush();

    const linkSpan = el.querySelector('.vk-ent.is-link') as HTMLElement;
    expect(linkSpan).toBeTruthy();
    expect(linkSpan.textContent).toBe('привет');
    expect(linkSpan.dataset.url).toBe('https://');
  });

  it('a shortcut on a collapsed caret starts typing inside a fresh span', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, '');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    el.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyB', ctrlKey: true, bubbles: true, cancelable: true}));
    await flush();
    const span = el.querySelector('.vk-ent.is-bold');
    expect(span).toBeTruthy();
    // the caret sits inside the span: the next typed characters are bold
    expect(span!.contains(window.getSelection()?.anchorNode ?? null)).toBe(true);
  });

  it('handles the original keymap with Ctrl and ignores plain keys', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, 'привет');
    select(el, 0, 6);

    el.dispatchEvent(new KeyboardEvent('keydown', {code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true}));
    await flush();
    expect(el.querySelector('.vk-ent.is-strike')).toBeTruthy();

    // without the modifier the key belongs to the text field
    const plain = new KeyboardEvent('keydown', {code: 'KeyB', bubbles: true, cancelable: true});
    el.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
  });

  it('closes on Escape before touching the reply or the edit', async() => {
    const onCancelReply = vi.fn();
    const root = document.body;
    dispose.push(render(() => <VKComposer peerId={'-1' as unknown as PeerId} reply={{mid: 1, author: 'Аня', text: 'хай'}} onCancelReply={onCancelReply} />, root));
    await flush();

    const el = editor(root);
    await type(el, 'привет мир');
    select(el, 0, 6);
    expect(menu(root)).toBeTruthy();

    el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    expect(menu(root)).toBeFalsy();
    expect(onCancelReply).not.toHaveBeenCalled();
  });

  it('sends text with real entities — no markdown anywhere', async() => {
    const root = await mount();
    const el = editor(root);
    await type(el, 'жирный и ссылка');
    select(el, 0, 6);
    menuButton(root, 'is-bold').click();
    select(el, 9, 15);
    (menu(root)!.querySelector('button[aria-label^="Ссылка"]') as HTMLButtonElement).click();
    await flush();

    (root.querySelector('button[aria-label="Отправить"]') as HTMLButtonElement).click();
    await flush();

    expect(managers.appMessagesManager.sendText).toHaveBeenCalledTimes(1);
    expect(managers.appMessagesManager.sendText).toHaveBeenCalledWith(expect.objectContaining({
      text: 'жирный и ссылка',
      entities: expect.arrayContaining([
        {_: 'messageEntityBold', offset: 0, length: 6},
        {_: 'messageEntityTextUrl', offset: 9, length: 6, url: 'https://'}
      ]),
      clearDraft: true
    }));
  });
});

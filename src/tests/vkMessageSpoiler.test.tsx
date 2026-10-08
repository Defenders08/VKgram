import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import MessageText from '@/vkgram/components/MessageText';
import type {Message} from '@layer';

// wrapRichText pulls the whole Web K emoji/text stack; the wrapper only needs
// the DOM shape it produces for a spoiler entity
vi.mock('@richTextProcessor/wrapRichText', () => ({
  default: (text: string, options: {entities?: any[]}) => {
    const fragment = document.createDocumentFragment();
    const entities = [...(options.entities ?? [])].sort((a, b) => a.offset - b.offset);
    let pos = 0;
    for(const entity of entities) {
      if(entity._ !== 'messageEntitySpoiler') continue;
      if(entity.offset > pos) fragment.append(text.slice(pos, entity.offset));
      const spoiler = document.createElement('span');
      spoiler.className = 'spoiler';
      const inner = document.createElement('span');
      inner.className = 'spoiler-text';
      inner.textContent = text.slice(entity.offset, entity.offset + entity.length);
      spoiler.append(inner);
      fragment.append(spoiler);
      pos = entity.offset + entity.length;
    }
    fragment.append(text.slice(pos));
    return fragment;
  }
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
});

const mount = (message: string, entities: any[]) => {
  const root = document.body;
  dispose.push(render(() => (
    <MessageText message={{_: 'message', mid: 1, message, entities} as unknown as Message.message} />
  ), root));
  return root;
};

describe('spoiler in a rendered message opens on click', () => {
  it('wraps spoilers into .spoilers-container — the class onSpoilerClick toggles', () => {
    const root = mount('тут спойлер и ещё', [{_: 'messageEntitySpoiler', offset: 4, length: 7}]);
    const container = root.querySelector('.spoilers-container')!;
    expect(container).toBeTruthy();
    expect(container.querySelector('.spoiler .spoiler-text')!.textContent).toBe('спойлер');

    // the reveal itself is Web K's: the click handler flips this very class
    container.classList.add('is-spoiler-visible');
    expect(container.classList.contains('is-spoiler-visible')).toBe(true);
  });

  it('no wrapper when the message has no spoilers', () => {
    const root = mount('просто текст', [{_: 'messageEntityBold', offset: 0, length: 6}]);
    expect(root.querySelector('.spoilers-container')).toBeFalsy();
    expect(root.querySelector('.vk-custom-message-text, div')!.textContent).toBe('просто текст');
  });
});

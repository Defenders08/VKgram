import {describe, expect, it} from 'vitest';
import {buildRichDOM, extractRich, serializeMarkdown} from '@/vkgram/utils/richEditor';
import type {MessageEntity} from '@layer';

const span = (kind: string, text: string, url?: string) => {
  const el = document.createElement('span');
  el.className = `vk-ent is-${kind}`;
  el.dataset.ent = kind;
  if(url) el.dataset.url = url;
  el.textContent = text;
  return el;
};

describe('richEditor: the WYSIWYG composer model', () => {
  it('extracts plain text with entities from styled spans', () => {
    const root = document.createElement('div');
    root.append('привет ', span('bold', 'мир'), '!');
    const {text, entities} = extractRich(root);
    expect(text).toBe('привет мир!');
    expect(entities).toEqual([{_: 'messageEntityBold', offset: 7, length: 3}]);
  });

  it('handles nested entities and links', () => {
    const root = document.createElement('div');
    const inner = span('bold', 'жирный ');
    inner.append(span('italic', 'курсив'));
    root.append(inner, ' и ', span('link', 'сайт', 'https://t.me'));
    const {text, entities} = extractRich(root);
    expect(text).toBe('жирный курсив и сайт');
    expect(entities).toEqual([
      {_: 'messageEntityBold', offset: 0, length: 13},
      {_: 'messageEntityItalic', offset: 7, length: 6},
      {_: 'messageEntityTextUrl', offset: 16, length: 4, url: 'https://t.me'}
    ]);
  });

  it('turns <br> into newlines and keeps spoilers', () => {
    const root = document.createElement('div');
    root.append('строка1', document.createElement('br'), span('spoiler', 'секрет'));
    const {text, entities} = extractRich(root);
    expect(text).toBe('строка1\nсекрет');
    expect(entities).toEqual([{_: 'messageEntitySpoiler', offset: 8, length: 6}]);
  });

  it('trims edge whitespace and shifts entities with it', () => {
    const root = document.createElement('div');
    root.append('  ', span('bold', 'жирный'), '  ');
    const {text, entities} = extractRich(root);
    expect(text).toBe('жирный');
    expect(entities).toEqual([{_: 'messageEntityBold', offset: 0, length: 6}]);
  });

  it('serializes entities back into markdown for drafts', () => {
    const entities: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 0, length: 6},
      {_: 'messageEntityTextUrl', offset: 9, length: 6, url: 'https://t.me'}
    ];
    expect(serializeMarkdown('жирный и ссылка', entities)).toBe('**жирный** и [ссылка](https://t.me)');
  });

  it('round-trips: build → extract keeps the text and the entities', () => {
    const entities: MessageEntity[] = [
      {_: 'messageEntityBold', offset: 0, length: 6},
      {_: 'messageEntityItalic', offset: 2, length: 4},
      {_: 'messageEntitySpoiler', offset: 7, length: 6}
    ];
    const root = document.createElement('div');
    buildRichDOM(root, 'жирный спойлер', entities);
    const built = extractRich(root);
    expect(built.text).toBe('жирный спойлер');
    expect(built.entities.sort((a, b) => a.offset - b.offset)).toEqual(entities);
  });
});

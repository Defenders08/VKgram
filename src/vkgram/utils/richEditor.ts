import type {MessageEntity} from '@layer';

/**
 * WYSIWYG-модель поля композера. В contenteditable лежит обычный текст и
 * инлайновые спаны сущностей (`.vk-ent.is-*`); при отправке DOM разбирается
 * в `text + entities` и уходит в `sendText` / `editMessage` напрямую —
 * никакого markdown в поле нет, маркеры не показываются в принципе.
 */

export type RichKind = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'spoiler' | 'link';

export const ENT_SPAN_CLASS = 'vk-ent';

const KIND_BY_ENTITY: Partial<{[E in MessageEntity['_']]: RichKind}> = {
  messageEntityBold: 'bold',
  messageEntityItalic: 'italic',
  messageEntityUnderline: 'underline',
  messageEntityStrike: 'strike',
  messageEntityCode: 'code',
  messageEntitySpoiler: 'spoiler',
  messageEntityTextUrl: 'link'
};

const ENTITY_BY_KIND: {[kind in Exclude<RichKind, 'link'>]: MessageEntity['_']} = {
  bold: 'messageEntityBold',
  italic: 'messageEntityItalic',
  underline: 'messageEntityUnderline',
  strike: 'messageEntityStrike',
  code: 'messageEntityCode',
  spoiler: 'messageEntitySpoiler'
};

// markdown-маркеры черновиков: диалект parseMarkdown самого Web K, который
// запускается при восстановлении черновика и при отправке подписей
const MARKDOWN_BY_KIND: {[kind in Exclude<RichKind, 'link'>]: string} = {
  bold: '**',
  italic: '__',
  underline: '_-_',
  strike: '~~',
  code: '`',
  spoiler: '||'
};

export const kindOfEntity = (entity: MessageEntity['_']): RichKind | undefined => KIND_BY_ENTITY[entity];

export const makeEntitySpan = (kind: RichKind, url?: string) => {
  const span = document.createElement('span');
  span.className = `${ENT_SPAN_CLASS} is-${kind}`;
  span.dataset.ent = kind;
  if(kind === 'link' && url) span.dataset.url = url;
  return span;
};

// цепочка сущностей, в которой лежит узел (до корня редактора)
const kindsOfNode = (node: Node, root: HTMLElement): {kind: RichKind, url?: string}[] => {
  const kinds: {kind: RichKind, url?: string}[] = [];
  let el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  while(el && el !== root) {
    const kind = (el as HTMLElement).dataset?.ent as RichKind | undefined;
    if(kind) kinds.push({kind, url: (el as HTMLElement).dataset.url});
    el = el.parentElement;
  }
  return kinds;
};

type KindMark = {kind: RichKind, url?: string};

/**
 * DOM редактора → `text + entities`. Смещения — в UTF-16-единицах JS-строки,
 * как этого ждёт MTProto. Краевые пробелы срезаются, сущности обрезаются
 * вместе с ними.
 */
export function extractRich(root: HTMLElement): {text: string, entities: MessageEntity[]} {
  let text = '';
  const segments: {start: number, end: number, kinds: KindMark[]}[] = [];

  const walk = (node: Node, kinds: KindMark[]) => {
    if(node.nodeType === Node.TEXT_NODE) {
      const value = node.nodeValue ?? '';
      if(value) {
        segments.push({start: text.length, end: text.length + value.length, kinds});
        text += value;
      }
      return;
    }
    if(node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if(el.tagName === 'BR') {
      text += '\n';
      return;
    }
    const next = el.dataset?.ent ? [...kinds, {kind: el.dataset.ent as RichKind, url: el.dataset.url}] : kinds;
    el.childNodes.forEach((child, index) => {
      const isBlock = child.nodeType === Node.ELEMENT_NODE && ((child as HTMLElement).tagName === 'DIV' || (child as HTMLElement).tagName === 'P');
      if(isBlock && index > 0) text += '\n';
      walk(child, next);
    });
  };
  walk(root, []);

  const entities: MessageEntity[] = [];
  const pushRun = (kind: RichKind, from: number, to: number, url?: string) => {
    if(to <= from) return;
    if(kind === 'link') {
      entities.push({_: 'messageEntityTextUrl', offset: from, length: to - from, url: url || ''});
    } else {
      entities.push({_: ENTITY_BY_KIND[kind], offset: from, length: to - from} as MessageEntity);
    }
  };

  const scannedKinds = [...Object.keys(ENTITY_BY_KIND), 'link'] as RichKind[];
  for(const kind of scannedKinds) {
    let start = -1;
    let url: string | undefined;
    for(const seg of segments) {
      const active = seg.kinds.find((k) => k.kind === kind);
      if(active) {
        if(start < 0) {
          start = seg.start;
          url = active.url;
        } else if((active.url || '') !== (url || '')) {
          pushRun(kind, start, seg.start, url);
          start = seg.start;
          url = active.url;
        }
      } else if(start >= 0) {
        pushRun(kind, start, seg.start, url);
        start = -1;
      }
    }
    if(start >= 0) pushRun(kind, start, text.length, url);
  }

  const lead = text.length - text.replace(/^\s+/, '').length;
  const trail = text.length - text.replace(/\s+$/, '').length;
  if(lead || trail) {
    const from = lead;
    const to = text.length - trail;
    for(const entity of entities) {
      const entityStart = Math.max(entity.offset, from);
      const entityEnd = Math.min(entity.offset + entity.length, to);
      entity.offset = entityStart - from;
      entity.length = entityEnd - entityStart;
    }
    text = text.slice(from, to);
  }

  return {text, entities: entities.filter((entity) => entity.length > 0)};
}

/**
 * `text + entities` → markdown-строка для черновика (диалект parseMarkdown).
 * Пересекающиеся не вложенно сущности не выражаются маркерами — для черновика
 * это допустимая потеря.
 */
export function serializeMarkdown(text: string, entities: MessageEntity[]): string {
  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);
  const opens: {pos: number, s: string}[] = [];
  const closes: {pos: number, s: string}[] = [];
  for(const entity of sorted) {
    const kind = kindOfEntity(entity._);
    if(!kind) continue;
    if(kind === 'link') {
      opens.push({pos: entity.offset, s: '['});
      closes.push({pos: entity.offset + entity.length, s: `](${(entity as MessageEntity & {url: string}).url})`});
    } else {
      const marker = MARKDOWN_BY_KIND[kind];
      opens.push({pos: entity.offset, s: marker});
      closes.push({pos: entity.offset + entity.length, s: marker});
    }
  }
  let result = '';
  let pos = 0;
  while(pos < text.length || opens.length || closes.length) {
    const nextPos = Math.min(
      text.length,
      ...(opens.length ? [opens[0].pos] : []),
      ...(closes.length ? [closes[0].pos] : [])
    );
    result += text.slice(pos, nextPos);
    pos = nextPos;
    // закрывающие — раньше открывающих на той же позиции; внутри одной группы
    // сохраняем порядок сортировки (внутренние раньше внешних)
    while(closes.length && closes[0].pos === pos) result += closes.shift()!.s;
    while(opens.length && opens[0].pos === pos) result += opens.shift()!.s;
    if(pos >= text.length && !opens.length && !closes.length) break;
  }
  return result;
}

/**
 * `text + entities` → DOM редактора: вложенные спаны сущностей. Сущности
 * без визуального аналога (упоминания, авто-ссылки) опускаются — сервер
 * распознаёт их на отправке заново.
 */
export function buildRichDOM(root: HTMLElement, text: string, entities: MessageEntity[]) {
  root.replaceChildren();
  const supported = entities
    .filter((entity) => !!kindOfEntity(entity._))
    .sort((a, b) => a.offset - b.offset || b.length - a.length);

  const build = (container: Element | DocumentFragment, from: number, to: number, list: MessageEntity[], first: number) => {
    let pos = from;
    let index = first;
    while(index < list.length) {
      const entity = list[index];
      if(entity.offset >= to) break;
      const start = Math.max(entity.offset, from);
      if(start > pos) container.append(text.slice(pos, start));
      const end = Math.min(entity.offset + entity.length, to);
      const span = makeEntitySpan(kindOfEntity(entity._)!, (entity as MessageEntity & {url?: string}).url);
      build(span, start, end, list, index + 1);
      container.append(span);
      pos = end;
      index = list.findIndex((next, j) => j > index && next.offset >= end);
      if(index === -1) break;
    }
    if(pos < to) container.append(text.slice(pos, to));
  };
  build(root, 0, text.length, supported, 0);
}

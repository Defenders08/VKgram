import {render} from 'solid-js/web';
import VKIcon, {type VKIconName} from '@/vkgram/components/VKIcons';

/**
 * The window of emoji / stickers / GIF is Web K's own (it works as it did); its icons are Web K's
 * font icons (`tgico`) and animated stickers. Here every one of them is swapped for VKgram's own:
 * the Web K glyph stays in the tree (hidden), our SVG sits before it and takes the colour of the
 * control (`currentColor`), so the current tab, the hover and the night theme work as for the rest
 * of the page. Web K redraws parts of the window (sets, search results), so the pass runs again
 * after every change of the tree.
 *
 * What an icon is, is read from where it sits (the class of its button, the section it belongs to),
 * never from its place in a row: the bottom bar has a search button besides the three tabs.
 */

type Rule = {test: RegExp, icon: VKIconName};

// the bottom bar: the class Web K gives the button
const BAR: Record<string, VKIconName> = {
  'emoji-tabs-search': 'search',
  'emoji-tabs-emoji': 'smile',
  'emoji-tabs-stickers': 'sticker',
  'emoji-tabs-gifs': 'gif',
  'emoji-tabs-delete': 'back'
};

// the sections of the emoji tab, in the order Web K lists them
const EMOJI_SECTIONS: VKIconName[] = ['smile', 'animals', 'food', 'travel', 'activity', 'objects', 'flag'];

// the quick searches beside the field (Love, Approval, Disapproval, Cheers, Laughter, Astonishment,
// Sadness, Anger, Neutral, Doubt, Silly, Premium) — the order is Web K's, the same in every language
const QUICK: VKIconName[] = ['heart', 'like', 'dislike', 'party', 'smile', 'wow', 'sad', 'angry', 'neutral', 'doubt', 'silly', 'star'];

// by the label of a button (the English Web K ones), when the place says nothing
const LABELS: Rule[] = [
  {test: /favorit/i, icon: 'bookmark'},
  {test: /recent|frequent/i, icon: 'clock'},
  {test: /smileys|people/i, icon: 'smile'},
  {test: /animals|nature/i, icon: 'animals'},
  {test: /food|drink/i, icon: 'food'},
  {test: /travel|places/i, icon: 'travel'},
  {test: /activity|sport/i, icon: 'activity'},
  {test: /objects/i, icon: 'objects'},
  {test: /flags/i, icon: 'flag'}
];

// by the class of the Web K icon itself (`tgico-smile`, `tgico-stickers`…), the last resort
const CLASSES: Rule[] = [
  {test: /close|clear|cancel/i, icon: 'close'},
  {test: /lock/i, icon: 'lock'},
  {test: /recent|clock|history/i, icon: 'clock'},
  {test: /sticker/i, icon: 'sticker'},
  {test: /gif/i, icon: 'gif'},
  {test: /search/i, icon: 'search'},
  {test: /dislike|thumbs?_?down|down/i, icon: 'dislike'},
  {test: /like|thumbs?_?up|\bup\b/i, icon: 'like'},
  {test: /heart|love/i, icon: 'heart'},
  {test: /party|confetti|celebrat/i, icon: 'party'},
  {test: /sad|cry/i, icon: 'sad'},
  {test: /smile|emoji|happy|laugh/i, icon: 'smile'}
];

const iconName = (icon: Element): VKIconName | undefined => {
  const own = icon.className?.toString?.() ?? '';

  // the lock of a premium set
  if(/category-title-lock/.test(own)) return 'lock';

  // the search field: the lupa, the way back, the cross
  if(icon.classList.contains('input-search-icon')) return 'search';
  if(icon.closest('.emoticons-search-input-arrow')) return 'back';
  if(icon.closest('.input-search-clear')) return 'close';

  // the heading of a section («Recent» has a cross that clears it)
  if(icon.closest('.category-title')) return 'close';

  // the bottom bar
  const bar = icon.closest('.emoji-tabs');
  if(bar) {
    const button = icon.closest('.menu-horizontal-div-item');
    if(button) for(const cls of Object.keys(BAR)) if(button.classList.contains(cls)) return BAR[cls];
  }

  // the row of sets on top
  const item = icon.closest('.emoticons-menu .menu-horizontal-div-item');
  if(item) {
    const inner = item.closest('.menu-horizontal-inner');
    if(inner) {
      const items = [...inner.querySelectorAll('.menu-horizontal-div-item')];
      const named = EMOJI_SECTIONS[items.indexOf(item)];
      if(named) return named;
    }

    const label = item.getAttribute('aria-label') ?? '';
    for(const rule of LABELS) if(rule.test.test(label)) return rule.icon;

    // no readable label: the first buttons of the row are «Favorites», «Recent» (stickers) or «Recent» (emoji)
    const panel = item.closest('.emoticons-container');
    const direct = [...(item.parentElement?.children ?? [])].filter((el) => el.matches('.menu-horizontal-div-item'));
    const index = direct.indexOf(item);
    if(panel?.classList.contains('stickers-padding')) return index === 0 ? 'bookmark' : index === 1 ? 'clock' : undefined;
    if(panel?.classList.contains('emoji-padding') && index === 0) return 'clock';
  }

  for(const rule of CLASSES) if(rule.test.test(own)) return rule.icon;
};

const sizeFor = (icon: Element) => {
  if(icon.closest('.category-title')) return 12;
  if(icon.classList.contains('input-search-icon')) return 16;
  if(icon.closest('.input-search')) return 14;
  return 20;
};

const mount = (name: VKIconName, size: number): HTMLElement => {
  const holder = document.createElement('span');
  holder.className = 'vk-emoji-icon';
  // a Solid component is not called as a function: it is rendered into its holder
  render(() => <VKIcon name={name} size={size} />, holder);
  return holder;
};

export function replaceEmojiPickerIcons(root: HTMLElement) {
  // Web K's font icons
  root.querySelectorAll<HTMLElement>('.tgico:not([data-vk-icon]), [class*="tgico-"]:not([data-vk-icon])').forEach((icon) => {
    const name = iconName(icon);
    if(!name) return;
    icon.dataset.vkIcon = name;
    icon.before(mount(name, sizeFor(icon)));
  });

  // the quick searches beside the field are Web K's animated stickers: ours take their place
  root.querySelectorAll<HTMLElement>('.emoticons-search-input-categories').forEach((row) => {
    [...row.querySelectorAll<HTMLElement>('.emoticons-search-input-category')].forEach((category, index) => {
      const sticker = category.querySelector<HTMLElement>('.emoticons-search-input-category-sticker');
      const name = QUICK[index];
      if(!sticker || !name || sticker.dataset.vkIcon) return;
      sticker.dataset.vkIcon = name;
      sticker.before(mount(name, 16));
    });
  });
}

/** Keeps the window's icons ours for as long as the window lives. */
export function watchEmojiPickerIcons(root: HTMLElement) {
  let frame = 0;
  const run = () => {
    frame = 0;
    replaceEmojiPickerIcons(root);
  };
  const observer = new MutationObserver(() => {
    if(!frame) frame = requestAnimationFrame(run);
  });
  observer.observe(root, {childList: true, subtree: true});
  run();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}

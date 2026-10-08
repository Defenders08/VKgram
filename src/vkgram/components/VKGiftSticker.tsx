import {onCleanup, onMount} from 'solid-js';

/**
 * Settings shared by a grid of gift stickers. The stickers are drawn with Web K's `wrapSticker`
 * directly (the way messages and the composer draw theirs): the old SuperStickerRenderer only drew
 * the outline thumb and relied on its own observer to load the real sticker, which never fired
 * for gifts, so the tiles stayed grey silhouettes.
 */
export function createGiftStickerRenderer(size: number, play: boolean) {
  return {size, play};
}

/** the gift's sticker, held in a box of its own size */
export default function VKGiftSticker(props: {
  doc: any,
  renderer: ReturnType<typeof createGiftStickerRenderer>,
  size: number
}) {
  let el!: HTMLDivElement;
  onMount(() => {
    const doc = props.doc;
    if(!doc) return;
    let destroyed = false;
    import('@components/wrappers/sticker')
    .then(({default: wrapSticker}) => {
      if(destroyed) return;
      el.replaceChildren();
      return wrapSticker({
        doc,
        div: el,
        width: props.size,
        height: props.size,
        loop: false,
        play: props.renderer.play,
        withThumb: true,
        group: 'none'
      } as any);
    })
    .catch((err) => console.error('VKgram: gift sticker failed', err));
    onCleanup(() => { destroyed = true; });
  });
  return <div class="vk-gift-sticker-box" ref={el} style={{width: props.size + 'px', height: props.size + 'px'}} />;
}

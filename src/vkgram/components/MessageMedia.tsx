import {createEffect, createMemo, Match, Show, Switch, createSignal, onCleanup, onMount} from 'solid-js';
import type {Message, MessageMedia, WebPage, Photo} from '@layer';
import wrapUrl from '@lib/richTextProcessor/wrapUrl';
import {UNSAFE_ANCHOR_LINK_TYPES} from '@helpers/addAnchorListener';
import type {MyDocument} from '@appManagers/appDocsManager';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';
import PhotoTsx from '@components/wrappers/photoTsx';
import VideoTsx from '@components/wrappers/videoTsx';
import DocumentTsx from '@components/wrappers/documentTsx';
import type {AudioElement} from '@components/audio';
import {emptyMediaListLoaderFactory} from '@components/emptyMediaListLoader';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {fileIconSvg, formatFileDate, getFileKind, VKFileKind} from '@/vkgram/utils/fileKind';
import VKRoundVideo from '@/vkgram/components/VKRoundVideo';
import VKVoiceMessage from '@/vkgram/components/VKVoiceMessage';

/**
 * Web K sizes a photo/video box with fixed px width AND height in inline
 * style. In a narrow column that either overflows or distorts, so the pair is
 * turned into `aspect-ratio` + `width: min(<px>, 100%)`: the box keeps its
 * proportions and never exceeds the column. The orientation of the box goes to
 * the root as a class — a post centers its media by it (landscape takes the
 * whole column, a vertical one keeps its width and centers).
 */
export function keepAspect(root: HTMLElement) {
  const apply = () => {
    let landscape: boolean | undefined;
    root.querySelectorAll<HTMLElement>('div[style*="width"][style*="height"]').forEach((el) => {
      const w = parseFloat(el.style.width);
      const h = parseFloat(el.style.height);
      if(!(w > 0) || !(h > 0) || el.classList.contains('media-container-aspecter')) return;
      el.style.aspectRatio = `${w} / ${h}`;
      // a fixed width capped by `max-width`, not `min(<px>, 100%)`: my own messages sit in a body that
      // shrinks to its content, where a percentage has nothing to resolve against and the box
      // collapsed to the size of its tiny blurred preview (a sent GIF / photo came out as a thumbnail).
      // In a column of a definite width the two forms give exactly the same box.
      el.style.width = `${w}px`;
      el.style.maxWidth = '100%';
      el.style.height = 'auto';
      landscape ??= w >= h;
    });
    if(landscape !== undefined) {
      root.classList.toggle('vk-media-landscape', landscape);
      root.classList.toggle('vk-media-portrait', !landscape);
    }
  };
  const observer = new MutationObserver(apply);
  observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['style']});
  apply();
  return observer;
}

type FileInfo = {name?: string, kind: VKFileKind, date?: string};

/**
 * A file is a row of a list: [preview or icon] [name / date, size]. Web K draws
 * the row itself (`.document`: its download, progress and click handling stay
 * untouched); this only dresses it for the list — the kind of the file as a
 * data attribute, an icon of that kind in the place of the preview when the
 * file has none, the full name (the stylesheet wraps it instead of Web K's
 * one-line middle ellipsis) and the date for the line under it. Nothing Web K
 * built is removed, and the same pass is repeated whenever Web K redraws.
 */
function decorateFiles(root: HTMLElement, getInfo: () => FileInfo | undefined) {
  const apply = () => {
    const info = getInfo();
    if(!info) return;

    root.querySelectorAll<HTMLElement>('.document').forEach((row) => {
      row.classList.add('vk-file');
      row.dataset.fileKind = info.kind;

      const ico = row.querySelector<HTMLElement>('.document-ico');
      if(ico) {
        const hasPreview = !!ico.querySelector('img, canvas, video, .media-container');
        const icon = ico.querySelector(':scope > .vk-file-icon');
        ico.classList.toggle('vk-file-ico-preview', hasPreview);
        if(hasPreview) icon?.remove();
        else if(!icon) ico.insertAdjacentHTML('afterbegin', fileIconSvg(info.kind));
      }

      const name = row.querySelector<HTMLElement>('.document-name');
      const size = row.querySelector<HTMLElement>('.document-size');
      if(name && info.name) {
        name.dataset.vkName = info.name;
        name.title = info.name;
      }

      if(size) {
        // Web K ends the size with a «·» that waits for a sender / a time; here that place is ours
        for(let i = size.childNodes.length - 1; i >= 0; i--) {
          const node = size.childNodes[i];
          const text = node.textContent ?? '';
          if(!text.trim()) continue;
          if(node.nodeType === Node.TEXT_NODE) node.textContent = text.replace(/[\s·•]+$/, '');
          else if(/^[\s·•]+$/.test(text) && node instanceof HTMLElement) node.hidden = true;
          break;
        }
        if(info.date) size.dataset.vkDate = info.date;
        else delete size.dataset.vkDate;
      }

      // name and the line under it share one column, whatever boxes Web K put them in
      if(name) {
        let box = name.parentElement;
        if(box === row) {
          box = document.createElement('div');
          row.insertBefore(box, name);
          box.append(name);
        }
        if(box) {
          box.classList.add('vk-file-info');

          // «size · <chat> · <time>» in one line: the source of a list's row joins the size
          const source = row.closest('.vk-media-row')?.querySelector<HTMLElement>('.vk-media-row-source');
          if(size || source) {
            let meta = box.querySelector<HTMLElement>(':scope > .vk-file-meta');
            if(!meta) {
              meta = document.createElement('div');
              meta.className = 'vk-file-meta';
              box.append(meta);
            }
            if(size && size.parentElement !== meta) meta.prepend(size);
            if(source && source.parentElement !== meta) meta.append(source);
          }
        }
      }
    });
  };

  const observer = new MutationObserver(apply);
  observer.observe(root, {childList: true, subtree: true});
  // the row is not in its list yet while it is being created: once it is, the source can join it
  requestAnimationFrame(apply);
  return {apply, observer};
}

export type MediaKind =
  | 'photo' | 'video' | 'gif' | 'round'
  | 'sticker' | 'audio' | 'voice' | 'document'
  | 'link' | 'other';

function StickerMedia(props: {message: Message.message, doc: MyDocument}) {
  let holder!: HTMLDivElement;
  const [failed, setFailed] = createSignal(false);

  onMount(() => {
    let destroyed = false;
    import('@components/wrappers/sticker')
      .then(({default: wrapSticker}) => wrapSticker({
        doc: props.doc,
        div: holder,
        width: 160,
        height: 160,
        loop: true,
        play: true,
        withThumb: true,
        needFadeIn: true
      }))
      .catch(() => {
        if(!destroyed) setFailed(true);
      });
    onCleanup(() => { destroyed = true; });
  });

  return (
    <Show when={!failed()} fallback={
      <DocumentTsx
        class="vk-message-document"
        message={props.message}
        searchContext={{
          peerId: props.message.peerId,
          inputFilter: {_: 'inputMessagesFilterDocument'}
        }}
        autoDownloadSize={0}
        getSize={() => 320}
      />
    }>
      <div ref={holder} class="vk-message-sticker" />
    </Show>
  );
}

export default function MessageMedia(props: {
  message: Message.message,
  boxSize?: number,
  /** a list of files: a video / GIF is a row with its preview, not a player */
  asFile?: boolean,
  onMediaClick?: (message: Message.message, target?: HTMLElement) => void
}) {
  const box = () => props.boxSize ?? 560;

  const kind = createMemo((): MediaKind | undefined => {
    const media = props.message.media as MessageMedia | undefined;
    if(!media) return;

    switch(media._) {
      case 'messageMediaPhoto':
        return getMediaFromMessage(props.message, true) ? 'photo' : undefined;

      case 'messageMediaDocument': {
        const doc = getMediaFromMessage(props.message, true) as MyDocument | undefined;
        if(!doc) return;
        switch(doc.type) {
          case 'video': return props.asFile ? 'document' : 'video';
          case 'gif': return props.asFile ? 'document' : 'gif';
          case 'round': return props.asFile ? 'document' : 'round';
          case 'sticker': return 'sticker';
          case 'audio': return 'audio';
          case 'voice': return 'voice';
          default: return 'document';
        }
      }

      case 'messageMediaWebPage':
        return (media as MessageMedia.messageMediaWebPage).webpage?._ === 'webPage' ? 'link' : undefined;

      case 'messageMediaEmpty':
        return;

      default:
        return 'other';
    }
  });

  // a plain file (not music, a voice message, a sticker…): its row of the list
  const fileInfo = createMemo((): FileInfo | undefined => {
    if(kind() !== 'document') return;
    const file = getMediaFromMessage(props.message, true) as MyDocument;
    return {
      name: file.file_name,
      kind: file.type === 'gif' ? 'gif' : getFileKind(file.file_name, file.mime_type)
    };
  });

  // music with a performer tag: the stylesheet of «Аудиозаписи» draws «performer — title» only then
  const hasPerformer = () => {
    if(kind() !== 'audio') return false;
    return !!getAudioTitles(getMediaFromMessage(props.message, true) as MyDocument)?.performer;
  };

  const photo = () => getMediaFromMessage(props.message, true) as Photo.photo;
  const doc = () => getMediaFromMessage(props.message, true) as MyDocument;
  const webPage = () => (props.message.media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage;

  // the url goes through Web K's own wrapper: `javascript:` and friends come out
  // as an https link, a telegram url gains the internal handler to dispatch on click
  const wrappedUrl = createMemo(() => wrapUrl(webPage().url));

  const handleLinkClick = (e: MouseEvent) => {
    const wrapped = wrappedUrl();
    if(!wrapped.onclick || UNSAFE_ANCHOR_LINK_TYPES.has(wrapped.onclick as never)) return;
    const handler = (window as any)[wrapped.onclick];
    if(!handler) return;
    e.preventDefault();
    // `safe` tells the handler the href is the url it looks like (no masked-link alert)
    const anchor = e.currentTarget as HTMLAnchorElement;
    anchor.setAttribute('safe', '1');
    handler(anchor, e);
  };

  const getClickTarget = (event: MouseEvent) => {
    const container = event.currentTarget as HTMLElement;
    return container.querySelector<HTMLElement>('img, video, canvas') ?? container;
  };

  const handleMediaClick = (event: MouseEvent) => {
    props.onMediaClick?.(props.message, getClickTarget(event));
  };

  return (
    <>
      <Show when={kind()}>
      <div
        class="vk-message-media"
        data-audio={kind() === 'audio' ? 'music' : kind() === 'voice' ? 'voice' : undefined}
        data-has-performer={hasPerformer() ? '' : undefined}
        ref={(el) => {
          const observer = keepAspect(el);
          // «<chat> · <date>» of a media list already says when the file was sent
          const files = decorateFiles(el, () => {
            const info = fileInfo();
            if(!info) return;
            return el.closest('.vk-media-row') ? info : {...info, date: formatFileDate(props.message.date)};
          });
          createEffect(() => {
            fileInfo();
            files.apply();
          });
          onCleanup(() => {
            observer.disconnect();
            files.observer.disconnect();
          });
        }}
        classList={{
          'vk-message-media-file': kind() === 'document',
          'vk-message-media-photo': kind() === 'photo',
          'vk-message-media-video': kind() === 'video' || kind() === 'gif' || kind() === 'round'
        }}
      >
        <Switch>
          <Match when={kind() === 'photo'}>
            <PhotoTsx
              class="vk-message-photo"
              photo={photo()}
              message={props.message}
              boxWidth={box()}
              boxHeight={box()}
              onClick={handleMediaClick}
            />
          </Match>

          <Match when={kind() === 'video' || kind() === 'gif'}>
            <VideoTsx
              class="vk-message-video"
              doc={doc()}
              message={props.message}
              boxWidth={box()}
              boxHeight={box()}
              onClick={handleMediaClick}
            />
          </Match>

          {/* a round video plays where it is: no viewer, the click is the player's */}
          <Match when={kind() === 'round'}>
            <VKRoundVideo message={props.message} doc={doc()} />
          </Match>

          <Match when={kind() === 'sticker'}>
            <StickerMedia message={props.message} doc={doc()} />
          </Match>

          <Match when={kind() === 'voice'}>
            <VKVoiceMessage message={props.message} />
          </Match>

          <Match when={kind() === 'audio' || kind() === 'document'}>
            <DocumentTsx
              class={`vk-message-document ${kind() === 'audio' ? 'vk-message-audio' : ''}`}
              message={props.message}
              searchContext={{
                peerId: props.message.peerId,
                inputFilter: {_: kind() === 'document' ? 'inputMessagesFilterDocument' : 'inputMessagesFilterMusic'}
              }}
              autoDownloadSize={kind() === 'audio' ? 2e6 : 0}
              getSize={() => 320}
              onResult={(row) => {
                // a track of the profile music (a local message, no chat behind it): Web K's own
                // playlist tab gives it its own loader; a chat search around its `mid` finds nothing
                if(props.message.pFlags.fakeForSavedMusic) (row as AudioElement).listLoaderFactory = emptyMediaListLoaderFactory;
              }}
            />
          </Match>

          <Match when={kind() === 'link'}>
            <a class="vk-message-link" href={wrappedUrl().url} target="_blank" rel="noopener noreferrer" onClick={handleLinkClick}>
              <Show when={webPage().site_name}>
                <span class="vk-message-link-site">{webPage().site_name}</span>
              </Show>
              <Show when={webPage().title}>
                <span class="vk-message-link-title">{webPage().title}</span>
              </Show>
              <Show when={webPage().description}>
                <span class="vk-message-link-description vk-page-text-secondary">{webPage().description}</span>
              </Show>
              <span class="vk-message-link-url vk-page-text-secondary">{webPage().display_url || webPage().url}</span>
            </a>
          </Match>

          <Match when={kind() === 'other'}>
            <button
              type="button"
              class="vk-button vk-button-secondary"
              onClick={() => openVKChat(props.message.peerId)}
            >
              Показать вложение в «Телеграм»
            </button>
          </Match>
        </Switch>
      </div>
    </Show>
    </>
  );
}

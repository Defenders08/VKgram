import {createEffect, createResource, createSignal, For, on, onCleanup, Show} from 'solid-js';
import type {Message, MessageEntity} from '@layer';
import type {SendFileDetails} from '@appManagers/appMessagesManager';
import type ChatInput from '@components/chat/input';
import rootScope from '@lib/rootScope';
import opusDecodeController from '@lib/opusDecodeController';
import VoiceWaveformAnalyser from '@helpers/voiceWaveformAnalyser';
import LiveWaveformAnalyser from '@helpers/voiceRecorder/liveWaveformAnalyser';
import LiveWaveform from '@components/chat/voiceRecording/liveWaveform';
import NativeVoiceRecorder, {isNativeVoiceRecorderSupported} from '@helpers/voiceRecorder/nativeVoiceRecorder';
import NativeVideoRecorder, {isNativeVideoRecorderSupported} from '@helpers/videoRecorder/nativeVideoRecorder';
import {createPosterFromMedia} from '@helpers/createPoster';
import ProgressRing from '@components/progressRing';
import {setRoundFlySource} from '@/vkgram/utils/roundMessageFly';
import type {EmoticonsDropdown} from '@components/emoticonsDropdown';
import EmojiTab from '@components/emoticonsDropdown/tabs/emoji';
import {watchEmojiPickerIcons} from '@/vkgram/components/vkEmojiPickerIcons';
import StickersTab from '@components/emoticonsDropdown/tabs/stickers';
import GifsTab from '@components/emoticonsDropdown/tabs/gifs';
import {getOverlayRoot} from '@helpers/appWindow';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import {IS_APPLE} from '@environment/userAgent';
import {openVKPostMenu} from '@/vkgram/pages/channel/VKPostMenu';
import VKIcon from '@/vkgram/components/VKIcons';
import VKFileIcon from '@/vkgram/components/VKFileIcon';
import {getFileKind} from '@/vkgram/utils/fileKind';
import parseMarkdown from '@lib/richTextProcessor/parseMarkdown';
import {buildRichDOM, extractRich, makeEntitySpan, serializeMarkdown, type RichKind} from '@/vkgram/utils/richEditor';

/**
 * Composer of «Сообщения». It owns only the input UI: every send goes through
 * Web K's own `appMessagesManager` (sendText / sendFile / sendGrouped /
 * editMessage) — there is no second message system here.
 *
 * Reply is `replyToMsgId` of MessageSendingParams (what Web K's
 * `chat.getMessageSendingParams()` produces for a reply), voice is the same
 * OGG/Opus recorder Web K's input uses (NativeVoiceRecorder → opus-recorder).
 */

export type ComposerReply = {mid: number, author: string, text: string};

type QueueKind = 'photo' | 'video' | 'document';
type QueueItem = {
  id: number,
  file: File,
  kind: QueueKind,
  url?: string,
  width?: number,
  height?: number,
  duration?: number
};

const MAX_ALBUM = 10;

// The round-video duration cap; the recording ring fills over it and the clip
// sends itself on reaching it — same cap and behavior as Web K's chatRecording.
const VIDEO_RECORD_MAX_MS = 60_000;

// The kinds of the format menu — real entities applied to the contenteditable
// input (the WYSIWYG model of the original): the DOM of the field is parsed
// into `text + entities` at send time by utils/richEditor.
type FormatKind = 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'spoiler' | 'link';

// the original's keys (Web K's handleMarkdownShortcut): Ctrl/Cmd + B I U S M P K
const FORMAT_KEYS: {[code: string]: FormatKind} = {
  KeyB: 'bold',
  KeyI: 'italic',
  KeyU: 'underline',
  KeyS: 'strike',
  KeyM: 'code',
  KeyP: 'spoiler',
  KeyK: 'link'
};

const formatKeyLabel = (key: string) => `${IS_APPLE ? '\u2318' : 'Ctrl+'}${key}`;

const kindOf = (file: File): QueueKind => {
  if(/^image\/(jpeg|png|webp|gif)$/.test(file.type) && file.type !== 'image/gif') return 'photo';
  if(/^video\/(mp4|quicktime|webm)$/.test(file.type)) return 'video';
  return 'document';
};

function probeImage(url: string) {
  return new Promise<{width: number, height: number} | undefined>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({width: img.naturalWidth, height: img.naturalHeight});
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

function probeVideo(url: string) {
  return new Promise<{width: number, height: number, duration: number} | undefined>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve({width: video.videoWidth, height: video.videoHeight, duration: Math.round(video.duration) || 0});
    video.onerror = () => resolve(undefined);
    video.src = url;
  });
}

export default function VKComposer(props: {
  peerId: PeerId,
  reply?: ComposerReply,
  editing?: Message.message,
  // a comments thread of the discussion group: everything is sent into it (a reply to the thread's root by default)
  threadId?: number,
  onCancelReply?: () => void,
  onCancelEdit?: () => void,
  onSent?: () => void
}) {
  const managers = () => rootScope.managers;

  const [rightsCanSend, {refetch}] = createResource(async() => {
    try {
      return await rootScope.managers.appMessagesManager.canSendToPeer(props.peerId, props.threadId);
    } catch(err) {
      return false;
    }
  });

  const [hasText, setHasText] = createSignal(false);
  const [queue, setQueue] = createSignal<QueueItem[]>([]);
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [recording, setRecording] = createSignal(false);
  const [recSeconds, setRecSeconds] = createSignal(0);
  const [recordVideoMode, setRecordVideoMode] = createSignal(false);
  const [canSwitchCamera, setCanSwitchCamera] = createSignal(false);
  const [switchingCamera, setSwitchingCamera] = createSignal(false);
  const [isBackCamera, setIsBackCamera] = createSignal(false);
  // the recording ring is drawn by the shared ProgressRing, which needs a px
  // size — the circle is 200px on desktop and 160px on narrow screens
  const [ringSize, setRingSize] = createSignal(window.innerWidth <= 600 ? 160 : 200);

  // «печатает…» for the other side: Telegram wants it again every ~5 s while typing goes on
  let lastTypingSent = 0;
  const sendTyping = () => {
    if(props.editing || !hasText()) return;
    const now = Date.now();
    if(now - lastTypingSent < 5000) return;
    lastTypingSent = now;
    Promise.resolve(managers().appMessagesManager.setTyping(
      props.peerId,
      {_: 'sendMessageTypingAction'},
      undefined,
      props.threadId
    )).catch(() => {
      // a typing hint is never worth an error
    });
  };

  let editorEl!: HTMLDivElement;
  let fileInput!: HTMLInputElement;

  // черновик хранится в markdown-формате Web K; редактор конвертирует его
  // обратно в сущности при восстановлении
  const saveDraft = () => {
    if(props.editing) return;
    const {text, entities} = extractRich(editorEl);
    if(text.trim()) managers().appDraftsManager.setDraft(props.peerId, props.threadId || 0, serializeMarkdown(text, entities)).catch(() => {});
  };
  let queueId = 0;

  const retrySend = () => {
    setError(undefined);
    void send();
  };

  const fail = (err: unknown, message: string) => {
    console.error('VKgram composer:', err);
    setError(message);
  };

  // entering the editing mode puts the message (text + entities) into the input;
  // leaving it clears
  createEffect(on(() => props.editing, (message) => {
    setError(undefined);
    if(message) {
      buildRichDOM(editorEl, message.message || '', (message.totalEntities ?? message.entities ?? []) as MessageEntity[]);
      setHasText(!!message.message);
      setQueue([]);
      void pickerPromise?.then((instance) => instance.toggle(false));
      queueMicrotask(() => editorEl?.focus());
    }
  }, {defer: true}));

  createEffect(on(() => props.reply, (reply) => {
    if(reply) queueMicrotask(() => editorEl?.focus());
  }, {defer: true}));

  // Restore / save draft via existing Web K drafts manager; drafts are stored
  // as markdown (the Web K format), the editor itself keeps real entities
  createEffect(on(() => props.peerId, async() => {
    try {
      const draft = await managers().appDraftsManager.getDraft(props.peerId, props.threadId);
      if(draft?.message && !props.editing && !hasText()) {
        const [draftText, draftEntities] = parseMarkdown(draft.message);
        buildRichDOM(editorEl, draftText, draftEntities);
        setHasText(!!draftText.trim());
      }
    } catch(e) {}
  }, {defer: true}));

  // a different dialog is a different composer state
  createEffect(on(() => props.peerId, () => {
    clearQueue();
    editorEl.replaceChildren();
    setHasText(false);
    setFormatOpen(false);
    void pickerPromise?.then((instance) => instance.toggle(false));
    setError(undefined);
    cancelRecording();
  }, {defer: true}));

  const sendingParams = () => ({
    peerId: props.peerId,
    ...(props.threadId ? {threadId: props.threadId} : {}),
    ...(props.reply ? {replyToMsgId: props.reply.mid} : props.threadId ? {replyToMsgId: props.threadId} : {})
  });

  const clearQueue = () => {
    queue().forEach((item) => item.url && URL.revokeObjectURL(item.url));
    setQueue([]);
  };

  onCleanup(() => {
    clearQueue();
    cancelRecording();
    if(recordVideoMode()) cancelVideoRecording();
  });

  // ── attachments ───────────────────────────────────────────────────────────

  const addFiles = async(files: File[]) => {
    if(!files.length || props.editing) return;
    setError(undefined);
    const items: QueueItem[] = [];
    for(const file of files) {
      const kind = kindOf(file);
      const item: QueueItem = {id: ++queueId, file, kind};
      if(kind !== 'document') {
        item.url = URL.createObjectURL(file);
        const info = kind === 'photo' ? await probeImage(item.url) : await probeVideo(item.url);
        if(info) Object.assign(item, info);
      }
      items.push(item);
    }
    setQueue((prev) => [...prev, ...items]);
    editorEl?.focus();
  };

  const onFilesPicked = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    void addFiles(files);
  };

  const onPaste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files || []);
    if(files.length) {
      event.preventDefault();
      void addFiles(files);
      return;
    }
    // в поле должен попадать только простой текст: форматирование вставки
    // сломало бы модель сущностей
    const text = event.clipboardData?.getData('text/plain');
    if(text) {
      event.preventDefault();
      document.execCommand('insertText', false, text);
      editorElNormalize();
      saveDraft();
    }
  };

  const removeItem = (id: number) => {
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if(item?.url) URL.revokeObjectURL(item.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const toDetails = (item: QueueItem): SendFileDetails => ({
    file: item.file,
    width: item.width,
    height: item.height,
    duration: item.duration
  });

  // ── send ──────────────────────────────────────────────────────────────────

  const canAttach = () => {
    // If banned_rights forbids media, hide attach button (keep text composer)
    const peer = rootScope.managers.appPeersManager.getPeer(props.peerId);
    const banned = (peer as any)?.banned_rights?.pFlags;
    if(banned?.send_media || banned?.send_photos || banned?.send_videos || banned?.send_gifs || banned?.send_stickers) return false;
    return true;
  };
  const canSend = () => !sending() && !recording() && (hasText() || queue().length > 0);

  const afterSend = () => {
    editorEl.replaceChildren();
    setHasText(false);
    clearQueue();
    setFormatOpen(false);
    props.onCancelReply?.();
    props.onSent?.();
  };

  // ── форматирование: WYSIWYG, как в оригинале ──────────────────────────────
  // Поле — contenteditable: форматирование применяется к выделению настоящими
  // сущностями (спаны .vk-ent), никаких маркеров в тексте нет. Меню всплывает
  // над выделением (точный прямоугольник даёт Range) и живёт, пока выделение:
  // так можно навесить жирный и курсив одним движением. При отправке DOM
  // разбирается в text + entities (utils/richEditor).

  const [formatOpen, setFormatOpen] = createSignal(false);
  let composerEl!: HTMLDivElement;
  let formatMenuEl: HTMLDivElement | undefined;

  const hasRichSelection = () => {
    const selection = window.getSelection();
    return !!selection && selection.rangeCount > 0 && !selection.isCollapsed &&
      editorEl.contains(selection.anchorNode);
  };

  const updateFormatMenu = () => {
    // фокус внутри самого меню (Tab) не закрывает его
    if(formatOpen() && formatMenuEl?.contains(document.activeElement)) return;
    if(!hasRichSelection()) setFormatOpen(false);
    else if(formatOpen()) placeFormatMenu(); // меню следует за выделением
    else setFormatOpen(true); // позицию ставит ref после вставки
  };

  // над началом выделения, в 4px над ним: отрицательный top — это нормально,
  // меню всплывает над композером и висит над историей чата
  const placeFormatMenu = () => {
    const menu = formatMenuEl;
    if(!menu || !menu.isConnected) return;
    const selection = window.getSelection();
    if(!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    // jsdom не умеет getBoundingClientRect у Range — там координаты нулевые
    const anchor = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : {left: 0, top: 0};
    const composerRect = composerEl.getBoundingClientRect();
    menu.style.top = `${anchor.top - composerRect.top - menu.offsetHeight - 4}px`;
    const maxLeft = Math.max(4, composerRect.width - menu.offsetWidth - 4);
    menu.style.left = `${Math.min(maxLeft, Math.max(4, anchor.left - composerRect.left))}px`;
  };

  const entitySpanOf = (node: Node | null, kind: RichKind) => {
    let el = node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement;
    while(el && el !== editorEl) {
      if((el as HTMLElement).dataset?.ent === kind) return el as HTMLElement;
      el = el.parentElement;
    }
    return undefined;
  };

  // суммарное текстовое смещение текстового узла внутри поля
  const plainOffsetOf = (target: Text, offset: number): number => {
    let total = 0;
    const walker = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT);
    for(let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      if(n === target) return total + offset;
      total += n.length;
    }
    return total;
  };

  // спан целиком попадает в выделение — формат снимется, а не завернётся заново
  const spanInsideSelection = (range: Range, span: HTMLElement): boolean => {
    const spanFirst = document.createTreeWalker(span, NodeFilter.SHOW_TEXT).nextNode() as Text | null;
    if(!spanFirst) return false;
    const spanFrom = plainOffsetOf(spanFirst, 0);
    const spanTo = spanFrom + (span.textContent?.length ?? 0);
    const from = range.startContainer.nodeType === Node.TEXT_NODE ? plainOffsetOf(range.startContainer as Text, range.startOffset) : 0;
    const to = range.endContainer.nodeType === Node.TEXT_NODE ? plainOffsetOf(range.endContainer as Text, range.endOffset) : (editorEl.textContent?.length ?? 0);
    return spanFrom >= Math.min(from, to) && spanTo <= Math.max(from, to);
  };

  // применить формат: свёрнутое выделение — новый пустой спан (печатаем уже
  // «форматированным»); выделение целиком внутри такой же сущности — снять её;
  // иначе — обернуть выделение и оставить его выделенным для следующего формата
  const wrapSelection = (kind: FormatKind) => {
    const selection = window.getSelection();
    if(!selection || !selection.rangeCount || !editorEl.contains(selection.anchorNode)) return;
    const range = selection.getRangeAt(0);
    const url = kind === 'link' ? 'https://' : undefined;

    if(range.collapsed) {
      const span = makeEntitySpan(kind, url);
      range.insertNode(span);
      const inner = document.createRange();
      inner.selectNodeContents(span);
      inner.collapse(true);
      selection.removeAllRanges();
      selection.addRange(inner);
      return;
    }

    // границы диапазона могут лежать по разные стороны спана — проверяем обе
    const container = entitySpanOf(range.startContainer, kind) ??
      entitySpanOf(range.endContainer, kind) ?? entitySpanOf(range.commonAncestorContainer, kind);
    if(container && spanInsideSelection(range, container)) {
      // снять сущность: содержимое возвращается на место спана
      const parent = container.parentElement!;
      while(container.firstChild) parent.insertBefore(container.firstChild, container);
      container.remove();
      editorElNormalize();
      return;
    }

    const span = makeEntitySpan(kind, url);
    span.append(range.extractContents());
    range.insertNode(span);
    const inner = document.createRange();
    inner.selectNodeContents(span);
    selection.removeAllRanges();
    selection.addRange(inner);
  };

  // пустой contenteditable браузеры заполняют <br> — чистим, чтобы работал
  // :empty-плейсхолдер; заодно держим актуальным признак «есть текст»
  const editorElNormalize = () => {
    if(!editorEl.firstChild || (editorEl.childNodes.length === 1 && (editorEl.firstChild as HTMLElement).tagName === 'BR')) {
      editorEl.replaceChildren();
    }
    setHasText(editorEl.textContent!.trim() !== '');
  };

  const send = async() => {
    if(!canSend()) return;
    const {text: value, entities} = extractRich(editorEl);
    if(!value.trim()) return;
    setSending(true);
    setError(undefined);

    try {
      const m = managers().appMessagesManager;

      if(props.editing) {
        if(!value) return;
        await m.editMessage(props.editing, value, {entities});
        editorEl.replaceChildren();
        setHasText(false);
        props.onCancelEdit?.();
        props.onSent?.();
        return;
      }

      const items = queue();
      if(!items.length) {
        // сущности уже готовы: поле WYSIWYG, parseMarkdown внутри sendText
        // просто не находит в тексте markdown-маркеров
        await m.sendText({...sendingParams(), text: value, entities, clearDraft: true});
        afterSend();
        return;
      }

      const media = items.filter((i) => i.kind !== 'document');
      const docs = items.filter((i) => i.kind === 'document');
      // подпись с сущностями уходит первому вложению, остальные — без неё
      let captionParts = value ? {caption: value, entities} : {caption: '', entities: [] as MessageEntity[]};
      const takeCaptionParts = () => {
        const parts = captionParts;
        captionParts = {caption: '', entities: []};
        return parts;
      };

      // photos and videos go as an album (grouped), the rest as separate files
      for(let i = 0; i < media.length; i += MAX_ALBUM) {
        const chunk = media.slice(i, i + MAX_ALBUM);
        if(chunk.length > 1) {
          await m.sendGrouped({
            ...sendingParams(),
            isMedia: true,
            ...takeCaptionParts(),
            sendFileDetails: chunk.map(toDetails),
            clearDraft: true
          });
        } else {
          await m.sendFile({
            ...sendingParams(),
            ...toDetails(chunk[0]),
            isMedia: true,
            ...takeCaptionParts(),
            clearDraft: true
          });
        }
      }

      for(const doc of docs) {
        await m.sendFile({
          ...sendingParams(),
          ...toDetails(doc),
          isMedia: false,
          ...takeCaptionParts(),
          clearDraft: true
        });
      }

      afterSend();
    } catch(err) {
      fail(err, 'Не удалось отправить сообщение.');
    } finally {
      setSending(false);
    }
  };

  // фокус ушёл из поля (клик по чужой кнопке, уход на фон) — меню закрыто;
  // переход в само меню (Tab) не считается
  const onInputFocusOut = (event: FocusEvent) => {
    if(formatMenuEl?.contains(event.relatedTarget as Node)) return;
    setFormatOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if(event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void send();
    } else if((event.ctrlKey || event.metaKey) && !event.altKey && FORMAT_KEYS[event.code]) {
      event.preventDefault();
      wrapSelection(FORMAT_KEYS[event.code]);
    } else if(event.key === 'Escape') {
      if(formatOpen()) setFormatOpen(false);
      else if(props.editing) props.onCancelEdit?.();
      else if(pickerPromise) void pickerPromise.then((instance) => {
        if(instance.isActive()) void instance.toggle(false);
      });
      else if(props.reply) props.onCancelReply?.();
    }
  };

  // the menu follows the selection: a click or Shift+arrows open it, a collapsed
  // caret or a foreign focus closes it
  document.addEventListener('selectionchange', updateFormatMenu);
  onCleanup(() => document.removeEventListener('selectionchange', updateFormatMenu));

  // ── emoji & stickers: Web K's own picker (the original emoji window) ────────

  const insertEmoji = (emoji: string) => {
    editorEl.focus();
    // insertText держит нативный undo и ставит каретку сам
    if(!document.execCommand('insertText', false, emoji)) {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : document.createRange();
      range.deleteContents();
      range.insertNode(document.createTextNode(emoji));
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    editorElNormalize();
    sendTyping();
    saveDraft();
  };

  let emojiButtonEl: HTMLElement;
  // the picker's module graph is heavy (the whole Web K IM stack), so it is
  // imported and built on the first click, not on the composer mount
  let pickerPromise: Promise<EmoticonsDropdown> | undefined;
  let detachPickerButton: () => void;

  // the slice of Web K's ChatInput surface the picker talks to, backed by this composer
  const pickerChatInput = {
    // getters: the picker outlives dialog switches
    get chat() {
      return {peerId: props.peerId, threadId: props.threadId};
    },
    // the picker's own backspace is built for the contenteditable input; the
    // textarea already has a real one, so the button is hidden (see CSS) and
    // this stays unused
    messageInput: undefined as HTMLTextAreaElement | undefined,
    messageInputField: {simulateInputEvent: (): void => {}},
    onEmojiSelected: (emoji: {emoji: string}) => insertEmoji(emoji.emoji),
    sendMessageWithDocument: async(options: Parameters<ChatInput['sendMessageWithDocument']>[0]) => {
      const doc = await managers().appDocsManager.getDoc(options.document);
      if(!doc) return false;
      try {
        await managers().appMessagesManager.sendFile({
          ...sendingParams(),
          file: doc,
          isMedia: true,
          clearDraft: options.clearDraft,
          silent: options.silent
        });
      } catch(err) {
        fail(err, 'Не удалось отправить.');
        return false;
      }
      props.onCancelReply?.();
      props.onSent?.();
      // like Web K's input: the picker closes over the sent sticker/gif
      void (await pickerPromise)?.toggle(false);
      return true;
    }
  };

  const buildEmojiPicker = async(): Promise<EmoticonsDropdown> => {
    const [{EmoticonsDropdown}, {default: EmojiTab}, {default: StickersTab}, {default: GifsTab}] = await Promise.all([
      import('@components/emoticonsDropdown'),
      import('@components/emoticonsDropdown/tabs/emoji'),
      import('@components/emoticonsDropdown/tabs/stickers'),
      import('@components/emoticonsDropdown/tabs/gifs')
    ]);
    const managers = rootScope.managers;
    const instance = new EmoticonsDropdown({
      tabsToRender: [
        new EmojiTab({
          managers,
          // regular emoji goes into the textarea (custom emoji falls back to
          // its unicode emoji, the composer sends plain text)
          onClick: (emoji) => insertEmoji(emoji.emoji)
        }),
        new StickersTab(managers),
        new GifsTab({managers})
      ],
      customParentElement: getOverlayRoot(),
      getOpenPosition: () => {
        // above the button, centered on it — the CSS clamps the popup into the
        // viewport again (min(100vh - height) / min(100vw - width))
        const rect = emojiButtonEl.getBoundingClientRect();
        const cloned = cloneDOMRect(rect);
        // the window is 300 × 336 (see `.vk-composer-emoji-picker` in vk-base.scss);
        // a 4px gap to the button (`snapPickerToButton` below closes whatever Web K adds on top)
        cloned.top = Math.max(8, rect.top - 340);
        cloned.left = Math.max(8, Math.min(window.innerWidth - 308, rect.left + rect.width / 2 - 150));
        return cloned;
      }
    });
    instance.chatInput = pickerChatInput as unknown as ChatInput;
    instance.getElement().classList.add('vk-composer-emoji-picker');
    // the icons of the window are ours (the window itself is Web K's)
    watchEmojiPickerIcons(instance.getElement());
    instance.setTextColor('primary-text-color');
    // the window stands right above the whole composer panel (its top line), 4px clear of it —
    // not over the panel and not floating above it
    const snapPickerToButton = () => {
      const el = instance.getElement();
      if(!emojiButtonEl || !el.isConnected) return;
      // `translate` is its own property: it does not fight Web K's transform animation
      el.style.translate = '';
      const panel = emojiButtonEl.closest('.vk-composer') ?? emojiButtonEl;
      const delta = panel.getBoundingClientRect().top - 4 - el.getBoundingClientRect().bottom;
      if(Math.abs(delta) > 1) el.style.translate = `0 ${Math.round(delta)}px`;
    };
    instance.addEventListener('open', () => {
      emojiButtonEl?.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(snapPickerToButton);
      // once more when the opening animation is over (the box is scaled while it runs)
      window.setTimeout(snapPickerToButton, 320);
    });
    instance.addEventListener('closed', () => emojiButtonEl?.setAttribute('aria-expanded', 'false'));
    return instance;
  };

  // every click toggles the picker (open → the first call builds it)
  const toggleEmojiPicker = async() => {
    const instance = await (pickerPromise ??= buildEmojiPicker());
    void instance.onButtonClick(emojiButtonEl);
  };

  const attachEmojiPicker = (button: HTMLElement) => {
    emojiButtonEl = button;
    detachPickerButton?.();
    const onClick = (): void => void toggleEmojiPicker();
    button.addEventListener('click', onClick);
    detachPickerButton = () => button.removeEventListener('click', onClick);
  };

  onCleanup(() => {
    detachPickerButton?.();
    void pickerPromise?.then((picker) => picker.hideAndDestroy());
    pickerPromise = undefined;
  });

  // ── voice ─────────────────────────────────────────────────────────────────

  let recorder: any;
  let analyser: VoiceWaveformAnalyser | undefined;
  // display-only live bars (uncompressed peaks), independent of the payload analyser
  let liveAnalyser: LiveWaveformAnalyser | undefined;
  let liveWaveform: LiveWaveform | undefined;
  let recStart = 0;
  let recTimer: number;
  let recCanceled = false;

  const stopTimer = () => clearInterval(recTimer);

  const teardownLiveWaveform = () => {
    liveAnalyser?.destroy();
    liveAnalyser = undefined;
    liveWaveform = undefined;
  };

  function cancelRecording() {
    if(!recorder) return;
    recCanceled = true;
    stopTimer();
    try {
      void recorder.stop();
    } catch(err) {}
    recorder = undefined;
    analyser = undefined;
    teardownLiveWaveform();
    setRecording(false);
  }

  const startRecording = async() => {
    if(recording() || props.editing) return;
    setRecordVideoMode(false);
    setError(undefined);

    const Recorder = isNativeVoiceRecorderSupported() ? NativeVoiceRecorder : (window as any).Recorder;
    if(!Recorder) {
      setError('Запись голоса не поддерживается в этом браузере.');
      return;
    }

    const rec = new Recorder({
      encoderSampleRate: 48000,
      monitorGain: 0,
      numberOfChannels: 1,
      recordingGain: 1,
      reuseWorker: true
    });
    recorder = rec;
    recCanceled = false;

    rec.onstop = () => {
      stopTimer();
      teardownLiveWaveform();
      setRecording(false);
    };

    rec.ondataavailable = async(typedArray: Uint8Array) => {
      const waveform = analyser?.finish();
      analyser = undefined;
      recorder = undefined;
      teardownLiveWaveform();
      if(recCanceled) return;

      const duration = Math.max(1, Math.round((Date.now() - recStart) / 1000));
      if(Date.now() - recStart < 500) return;

      const file = new Blob([typedArray as BlobPart], {type: 'audio/ogg'});
      try {
        const result = await opusDecodeController.decode(typedArray, false);
        opusDecodeController.setKeepAlive(false);
        await managers().appMessagesManager.sendFile({
          ...sendingParams(),
          file,
          isVoiceMessage: true,
          isMedia: true,
          duration,
          waveform,
          objectURLBlob: result.blob,
          clearDraft: true
        });
        props.onCancelReply?.();
        props.onSent?.();
      } catch(err) {
        fail(err, 'Не удалось отправить голосовое сообщение.');
      }
    };

    try {
      await rec.start();
      recStart = Date.now();
      analyser = new VoiceWaveformAnalyser(rec.sourceNode);
      // the live bars of the recording bar: a second tap on the same source,
      // feeding unprocessed peaks to the canvas renderer
      liveAnalyser = new LiveWaveformAnalyser(rec.sourceNode);
      liveWaveform = new LiveWaveform({activeColorVar: '--vk-danger', height: 24});
      liveAnalyser.onpeak = (peak) => liveWaveform?.pushPeak(peak);
      setRecSeconds(0);
      setRecording(true);
      recTimer = window.setInterval(() => setRecSeconds(Math.floor((Date.now() - recStart) / 1000)), 250);
    } catch(err) {
      recorder = undefined;
      teardownLiveWaveform();
      fail(err, 'Нет доступа к микрофону.');
    }
  };

  const finishRecording = () => {
    if(!recorder) return;
    try {
      void recorder.stop();
    } catch(err) {
      fail(err, 'Не удалось завершить запись.');
    }
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── video note (round video) ────────────────────────────────────────────────

  let videoRecorder: any;
  let videoStream: MediaStream | undefined;
  let previewVideoEl: HTMLVideoElement | undefined;
  let videoRecStart = 0;
  let videoRecCanceled = false;
  let videoRecTimer: number;

  const startVideoRecording = async() => {
    if(recording() || props.editing) return;
    releaseVideoStream();
    setError(undefined);
    setRecordVideoMode(true);
    setCanSwitchCamera(false);
    setSwitchingCamera(false);
    setIsBackCamera(false);

    const VideoRecorderClass = isNativeVideoRecorderSupported() ? NativeVideoRecorder : undefined;
    if(!VideoRecorderClass) {
      setError('Запись видео-кружков не поддерживается в этом браузере.');
      setRecordVideoMode(false);
      return;
    }

    try {
      videoRecorder = new VideoRecorderClass({
        width: 400,
        height: 400,
        frameRate: 30,
        videoBitsPerSecond: 1_200_000,
        audioBitsPerSecond: 64_000
      });
      const rec = videoRecorder;
      videoRecCanceled = false;

      // a late stop of a canceled/superseded session must not touch the state of a new one
      rec.onstop = () => {
        if(videoRecorder !== rec) return;
        clearInterval(videoRecTimer);
        setRecording(false);
        setRecordVideoMode(false);
        releaseVideoStream();
      };

      rec.ondataavailable = async(blob: Blob) => {
        if(videoRecCanceled || videoRecorder !== rec) return;

        // grab the poster from the still-live camera frame before anything
        // awaits — onstop (the next event) releases the preview; a failed
        // capture only means a circle without a thumbnail, not a failed send
        const thumbPromise = (async() => {
          if(!previewVideoEl) return undefined;
          try {
            return await createPosterFromMedia(previewVideoEl);
          } catch(e) {
            return undefined;
          }
        })();

        const duration = Math.max(1, Math.round((Date.now() - videoRecStart) / 1000));
        if(Date.now() - videoRecStart < 500) return;

        try {
          const thumb = await thumbPromise;
          await managers().appMessagesManager.sendFile({
            ...sendingParams(),
            file: blob,
            isVoiceMessage: false,
            isMedia: true,
            isRoundMessage: true,
            duration,
            width: 400,
            height: 400,
            // the recorded blob stays in the local cache: the sender watches the
            // circle right away instead of downloading their own file
            objectURLBlob: blob,
            thumb: thumb && {blob: thumb.blob, size: thumb.size},
            clearDraft: true
          });
          props.onCancelReply?.();
          props.onSent?.();
        } catch(err) {
          fail(err, 'Не удалось отправить видео-кружок.');
        }
      };

      await rec.start();
      videoRecStart = Date.now();
      videoStream = (rec as any).stream || undefined;
      setIsBackCamera(trackFacing(videoStream) === 'environment');
      // the flip button only makes sense with more than one camera; labels and
      // ids are listed only after the permission was granted — we just got it
      void navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
        if(videoRecorder !== rec) return;
        setCanSwitchCamera(devices.filter((device) => device.kind === 'videoinput').length > 1);
      }).catch(() => {});
      setRecording(true);
      videoRecTimer = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - videoRecStart) / 1000);
        setRecSeconds(seconds);
        // the cap: the ring is full and the clip sends itself, like Telegram's
        if(seconds * 1000 >= VIDEO_RECORD_MAX_MS) {
          clearInterval(videoRecTimer);
          finishVideoRecording();
        }
      }, 250);
    } catch(err) {
      videoRecorder = undefined;
      setRecording(false);
      setRecordVideoMode(false);
      fail(err, 'Нет доступа к камере или микрофону.');
    }
  };

  const trackFacing = (stream: MediaStream | undefined): 'user' | 'environment' | undefined => {
    const track = stream?.getVideoTracks()[0];
    return track?.getSettings?.().facingMode as 'user' | 'environment' | undefined;
  };

  // swap the camera mid-recording; the recorded file just switches view — the
  // canvas pipeline keeps flowing under the encoder
  const switchCamera = async() => {
    const rec = videoRecorder;
    if(!rec || typeof rec.switchCamera !== 'function' || switchingCamera()) return;
    setSwitchingCamera(true);
    setError(undefined);
    try {
      // prefer cycling the real device ids; flip the facing when they are hidden
      const track = videoStream?.getVideoTracks()[0];
      const currentDeviceId = track?.getSettings?.().deviceId;
      const target: {videoDeviceId?: string, facingMode?: 'user' | 'environment'} = {};
      if(currentDeviceId) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        target.videoDeviceId = devices.find((device) => device.kind === 'videoinput' && device.deviceId && device.deviceId !== currentDeviceId)?.deviceId;
      }
      if(!target.videoDeviceId) {
        target.facingMode = (trackFacing(videoStream) ?? 'user') === 'environment' ? 'user' : 'environment';
      }

      await rec.switchCamera(target);
      if(videoRecorder !== rec) return;
      videoStream = (rec as any).stream || undefined;
      if(previewVideoEl && videoStream) previewVideoEl.srcObject = videoStream;
      setIsBackCamera(trackFacing(videoStream) === 'environment');
    } catch(err) {
      // the recording continues on the current camera
      fail(err, 'Не удалось переключить камеру.');
    } finally {
      setSwitchingCamera(false);
    }
  };

  const finishVideoRecording = () => {
    if(!videoRecorder) return;
    // the optimistic circle in the chat will fly from the preview's place
    if(previewVideoEl) setRoundFlySource(props.peerId, previewVideoEl.getBoundingClientRect());
    try {
      void videoRecorder.stop();
    } catch(err) {
      fail(err, 'Не удалось завершить запись видео.');
    }
  };

  // consumes the active recorder: releases its pipeline (the camera tracks die
  // with it), detaches the preview and stops the raw stream tracks
  const releaseVideoStream = () => {
    if(videoRecorder) {
      const rec = videoRecorder;
      videoRecorder = undefined;
      if(typeof rec.releaseStream === 'function') {
        try { rec.releaseStream(); } catch(e) {}
      }
    }
    if(previewVideoEl) {
      previewVideoEl.srcObject = null;
      previewVideoEl = undefined;
    }
    if(videoStream) {
      videoStream.getTracks().forEach((t) => { try { t.stop(); } catch(e) {} });
      videoStream = undefined;
    }
  };

  const cancelVideoRecording = () => {
    if(!videoRecorder) return;
    videoRecCanceled = true;
    clearInterval(videoRecTimer);
    const rec = videoRecorder;
    try {
      void rec.stop();
    } catch(err) {}
    releaseVideoStream();
    setRecording(false);
    setRecordVideoMode(false);
  };

  // the recording UI replaces the input: Escape cancels, the cancel button takes
  // the focus for keyboard and screen-reader users, and after the recording ends
  // (sent or canceled) the focus returns to the input
  createEffect(on(recording, (isRecording) => {
    if(isRecording) {
      const onKey = (event: KeyboardEvent) => {
        if(event.key !== 'Escape') return;
        event.preventDefault();
        if(recordVideoMode()) cancelVideoRecording();
        else cancelRecording();
      };
      window.addEventListener('keydown', onKey);
      onCleanup(() => window.removeEventListener('keydown', onKey));
    } else {
      queueMicrotask(() => {
        if(!recording()) editorEl?.focus({preventScroll: true});
      });
    }
  }, {defer: true}));

  // ── attach menu: the project's own menu (VKPostMenu), standing above the clip ──────────────

  let attachButton!: HTMLButtonElement;
  let closeAttachMenu: (() => void) | undefined;
  // a press on the clip closes the open menu (press outside) and the click that follows must not reopen it
  let attachJustClosed = false;

  const pickFiles = (accept: string) => {
    fileInput.accept = accept;
    fileInput.click();
  };

  const toggleAttachMenu = () => {
    if(attachJustClosed) return;
    if(closeAttachMenu) {
      closeAttachMenu();
      return;
    }
    const rect = attachButton.getBoundingClientRect();
    attachButton.setAttribute('aria-expanded', 'true');
    closeAttachMenu = openVKPostMenu({
      anchor: {x: rect.left, y: rect.top - 4, align: 'cursor', above: true},
      items: [
        {icon: 'photos', title: 'Фотография или видео', onClick: () => pickFiles('image/*,video/*')},
        {icon: 'docs', title: 'Документ', onClick: () => pickFiles('')},
        {
          icon: 'audio',
          title: 'Музыка',
          onClick: async() => {
            const {default: showMusicSearchPopup} = await import('@components/popups/musicSearch');
            showMusicSearchPopup({chat: {peerId: props.peerId} as any});
          }
        },
        {
          icon: 'poll',
          title: 'Опрос',
          separator: true,
          onClick: async() => {
            const [{openCreatePollPopup}, {default: SolidJSHotReloadGuardProvider}] = await Promise.all([
              import('@components/popups/createPoll'),
              import('@lib/solidjs/hotReloadGuardProvider')
            ]);
            openCreatePollPopup({
              isBroadcast: false,
              supportedMediaTypes: ['link', 'photo', 'video', 'gif', 'sticker'],
              onSubmit: async(payload) => {
                const managers = rootScope.managers;
                const params = sendingParams();
                try {
                  await managers.appPollsManager.sendPollMessage(params, payload);
                  props.onSent?.();
                } catch(err) {
                  console.error('VKgram: sendPollMessage failed', err);
                  setError('Не удалось отправить опрос.');
                }
              }
            }, SolidJSHotReloadGuardProvider);
          }
        },
        {
          icon: 'checklist',
          title: 'Чек-лист',
          onClick: async() => {
            const {default: showChecklistPopup} = await import('@components/popups/checklist');
            showChecklistPopup({chat: {peerId: props.peerId} as any});
          }
        }
      ],
      onClose: () => {
        closeAttachMenu = undefined;
        attachButton?.setAttribute('aria-expanded', 'false');
        attachJustClosed = true;
        window.setTimeout(() => { attachJustClosed = false; }, 250);
      }
    });
  };

  onCleanup(() => closeAttachMenu?.());

  const [dragOver, setDragOver] = createSignal(false);

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if(files.length) void addFiles(files);
  };

  // ── view ──────────────────────────────────────────────────────────────────

  return (
    <Show when={!rightsCanSend.loading}>
      <Show
        when={rightsCanSend()}
        fallback={
          <div class="vk-composer vk-composer-cannot-send">
            <span>Вы не можете писать</span>
          </div>
        }
      >
        <div
          ref={composerEl}
          class="vk-composer"
          classList={{'is-drag-over': dragOver()}}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
      <Show when={props.editing}>
        <div class="vk-composer-reply">
          <div class="vk-composer-reply-info">
            <span class="vk-composer-reply-name">Редактирование</span>
            <span class="vk-composer-reply-text">{props.editing!.message}</span>
          </div>
          <button type="button" class="vk-composer-btn" aria-label="Отменить редактирование" onClick={() => {
            editorEl.replaceChildren();
            setHasText(false);
            props.onCancelEdit?.();
          }}>
            <VKIcon name="close" size={14} />
          </button>
        </div>
      </Show>

      <Show when={props.reply && !props.editing}>
        <div class="vk-composer-reply">
          <div class="vk-composer-reply-info">
            <span class="vk-composer-reply-name">{props.reply!.author}</span>
            <span class="vk-composer-reply-text">{props.reply!.text}</span>
          </div>
          <button type="button" class="vk-composer-btn" aria-label="Отменить ответ" onClick={() => props.onCancelReply?.()}>
            <VKIcon name="close" size={14} />
          </button>
        </div>
      </Show>

      <Show when={queue().length}>
        <div class="vk-composer-attach-queue">
          <For each={queue()}>
            {(item) => (
              <div class="vk-composer-attach-chip">
                <Show when={item.kind === 'photo'}>
                  <img class="vk-composer-attach-thumb" src={item.url} alt="" />
                </Show>
                <Show when={item.kind === 'video'}>
                  <video class="vk-composer-attach-thumb" src={item.url} muted preload="metadata" />
                </Show>
                <Show when={item.kind === 'document'}>
                  <div class="vk-composer-attach-file" title={item.file.name}>
                    <VKFileIcon kind={getFileKind(item.file.name, item.file.type)} size={22} />
                  </div>
                </Show>
                <button type="button" class="vk-composer-attach-remove" aria-label="Убрать вложение" onClick={() => removeItem(item.id)}>
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* the live camera preview of the circle: part of the composer flow (it used
          to float over the chat), mirrored like a selfie — the file is not */}
      <Show when={recording() && recordVideoMode()}>
        <div class="vk-composer-rec-preview" ref={(el: HTMLElement) => {
          if(typeof ResizeObserver === 'undefined') return;
          const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width;
            if(width) setRingSize(Math.round(width));
          });
          observer.observe(el);
          onCleanup(() => observer.disconnect());
        }}>
          <div class="vk-composer-rec-video" classList={{'is-back': isBackCamera()}} aria-hidden="true">
            <video ref={(el: HTMLVideoElement) => {
              previewVideoEl = el;
              if(videoStream) el.srcObject = videoStream;
              el.muted = true;
              el.autoplay = true;
              el.playsInline = true;
            }} />
            {/* fills clockwise from 12 o'clock over the 60s cap */}
            <ProgressRing
              size={ringSize()}
              strokeOpacity={0.9}
              class="vk-composer-rec-ring"
              progress={Math.min(1, recSeconds() * 1000 / VIDEO_RECORD_MAX_MS)}
            />
          </div>
          <Show when={canSwitchCamera()}>
            <button
              type="button"
              class="vk-composer-rec-flip"
              title="Переключить камеру"
              aria-label="Переключить камеру"
              disabled={switchingCamera()}
              onClick={() => void switchCamera()}
            >
              <VKIcon name="camera-flip" size={18} />
            </button>
          </Show>
        </div>
      </Show>

      <div class="vk-composer-row">
        <Show when={!props.editing && !recording() && canAttach()}>
          <button
            type="button"
            class="vk-composer-btn"
            title="Прикрепить"
            aria-label="Прикрепить"
            aria-haspopup="menu"
            aria-expanded="false"
            ref={attachButton}
            onClick={toggleAttachMenu}
          >
            <VKIcon name="docs" size={22} />
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={onFilesPicked}
          />
        </Show>

        <Show when={!recording()} fallback={
          <div class="vk-composer-input vk-composer-rec-status" role="timer">
            <span class="vk-composer-rec-dot" />
            <span class="vk-composer-rec-time">{mmss(recSeconds())}</span>
            <Show
              when={recordVideoMode()}
              fallback={
                /* the live voice bars: the canvas renderer pushes in from the right */
                <div class="vk-composer-rec-wave" ref={(el: HTMLElement) => {
                  if(liveWaveform) el.replaceChildren(liveWaveform.element);
                }} />
              }
            >
              <span class="vk-composer-rec-label">Видео-кружок</span>
            </Show>
          </div>
        }>
          {/* Minimal formatting toolbar — real entities via parseMarkdown on send */}
          {/* WYSIWYG-поле: форматирование живёт прямо в тексте (спаны сущностей) */}
          <div
            ref={editorEl}
            class="vk-composer-input"
            contenteditable={!sending()}
            role="textbox"
            aria-multiline="true"
            aria-label={props.editing ? 'Изменить сообщение…' : 'Написать сообщение…'}
            data-placeholder={props.editing ? 'Изменить сообщение…' : 'Написать сообщение…'}
            spellcheck={false}
            onInput={() => {
              editorElNormalize();
              sendTyping();
              saveDraft();
            }}
            onKeyDown={onKeyDown}
            onFocusOut={onInputFocusOut}
            onPaste={onPaste}
          />
        </Show>

        <Show when={!recording()}>
          <div class="vk-composer-emoji-holder">
            <button
              type="button"
              class="vk-composer-btn"
              title="Эмодзи, стикеры, GIF"
              aria-label="Эмодзи, стикеры, GIF"
              aria-haspopup="dialog"
              aria-expanded="false"
              ref={(el: HTMLElement) => attachEmojiPicker(el)}
            >
              <VKIcon name="smile" size={22} />
            </button>
          </div>
        </Show>

        <Show when={recording()}>
          <button type="button" class="vk-composer-btn" title="Отменить запись" aria-label="Отменить запись" ref={(el: HTMLButtonElement) => queueMicrotask(() => {
            // the ref runs before the Show subtree is inserted — focus() on a
            // detached element is a no-op, so wait for the insertion
            if(el.isConnected) el.focus({preventScroll: true});
          })} onClick={() => recordVideoMode() ? cancelVideoRecording() : cancelRecording()}>
            <VKIcon name="close" size={16} />
          </button>
        </Show>

        <Show
          when={canSend() || recording() || props.editing}
          fallback={
            <>
              {!isNativeVideoRecorderSupported() ? null : (
                <button type="button" class="vk-composer-btn" title="Записать видео-кружок" aria-label="Записать видео-кружок" onClick={() => void startVideoRecording()}>
                  <VKIcon name="record-video" size={24} />
                </button>
              )}
              <button type="button" class="vk-composer-btn" title="Записать голосовое сообщение" aria-label="Записать голосовое сообщение" onClick={() => void startRecording()}>
                <VKIcon name="cassette" size={24} />
              </button>
            </>
          }
        >
          <button
            type="button"
            class="vk-composer-btn vk-composer-send"
            title={recording() ? (recordVideoMode() ? 'Отправить видео-кружок' : 'Отправить голосовое сообщение') : props.editing ? 'Сохранить' : 'Отправить'}
            aria-label={recording() ? (recordVideoMode() ? 'Отправить видео-кружок' : 'Отправить голосовое сообщение') : props.editing ? 'Сохранить' : 'Отправить'}
            disabled={recording() ? false : !canSend()}
            onClick={() => recording() ? (recordVideoMode() ? finishVideoRecording() : finishRecording()) : void send()}
          >
            {sending() ? '…' : '➤'}
          </button>
        </Show>
      </div>

      {/* меню форматирования: всплывает над полем, пока в нём выделен текст */}
      <Show when={formatOpen()}>
        <div
          class="vk-format-menu"
          role="toolbar"
          aria-label="Форматирование"
          ref={(el: HTMLDivElement) => {
            formatMenuEl = el;
            // ref срабатывает до вставки — размеры снимаем после неё
            queueMicrotask(() => {
              if(el.isConnected) placeFormatMenu();
            });
          }}
          onMouseDown={(event: MouseEvent) => {
            // меню не должно забирать фокус: выделение в поле должно дожить до клика
            event.preventDefault();
          }}
        >
          <button type="button" class="vk-composer-format-btn is-bold" title={`Жирный (${formatKeyLabel('B')})`} aria-label={`Жирный (${formatKeyLabel('B')})`} onClick={() => wrapSelection('bold')}>B</button>
          <button type="button" class="vk-composer-format-btn is-italic" title={`Курсив (${formatKeyLabel('I')})`} aria-label={`Курсив (${formatKeyLabel('I')})`} onClick={() => wrapSelection('italic')}>I</button>
          <button type="button" class="vk-composer-format-btn is-underline" title={`Подчёркнутый (${formatKeyLabel('U')})`} aria-label={`Подчёркнутый (${formatKeyLabel('U')})`} onClick={() => wrapSelection('underline')}>U</button>
          <button type="button" class="vk-composer-format-btn is-strike" title={`Зачёркнутый (${formatKeyLabel('S')})`} aria-label={`Зачёркнутый (${formatKeyLabel('S')})`} onClick={() => wrapSelection('strike')}>S</button>
          <button type="button" class="vk-composer-format-btn is-mono" title={`Моноширинный (${formatKeyLabel('M')})`} aria-label={`Моноширинный (${formatKeyLabel('M')})`} onClick={() => wrapSelection('code')}>{'</>'}</button>
          <button type="button" class="vk-composer-format-btn" title={`Спойлер (${formatKeyLabel('P')})`} aria-label={`Спойлер (${formatKeyLabel('P')})`} onClick={() => wrapSelection('spoiler')}>
            <VKIcon name="eye-off" size={15} />
          </button>
          <button type="button" class="vk-composer-format-btn" title={`Ссылка (${formatKeyLabel('K')})`} aria-label={`Ссылка (${formatKeyLabel('K')})`} onClick={() => wrapSelection('link')}>
            <VKIcon name="link" size={15} />
          </button>
        </div>
      </Show>

      <Show when={error()}>
        <div class="vk-composer-error">
          <span>{error()}</span>
          <button type="button" class="vk-composer-retry" onClick={retrySend} aria-label="Повторить отправку">Повторить</button>
        </div>
      </Show>
    </div>
  </Show>
  </Show>
  );
}

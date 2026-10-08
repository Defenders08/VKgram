/**
 * The kind of a file attachment (what its row in a list looks like): the icon
 * set and the helpers that pick one. Pure functions, no Web K, no DOM — the
 * icon markup is a string so that both a Solid component (VKFileIcon) and the
 * code that decorates Web K's own `.document` row (MessageMedia) draw the same
 * glyphs.
 */

export type VKFileKind =
  | 'file' | 'text' | 'pdf' | 'apk' | 'archive' | 'torrent'
  | 'sheet' | 'code' | 'audio' | 'video' | 'image' | 'gif';

const BY_EXTENSION: {[kind in Exclude<VKFileKind, 'file'>]: string[]} = {
  text: ['txt', 'rtf', 'md', 'log', 'doc', 'docx', 'odt', 'epub', 'fb2'],
  pdf: ['pdf'],
  apk: ['apk', 'xapk', 'apks', 'aab', 'ipa'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'iso'],
  torrent: ['torrent'],
  sheet: ['xls', 'xlsx', 'ods', 'csv', 'tsv'],
  code: ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'xml', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'bat', 'sql', 'yml', 'yaml'],
  audio: ['mp3', 'ogg', 'oga', 'opus', 'wav', 'flac', 'm4a', 'aac', 'wma'],
  video: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'm4v', '3gp'],
  gif: ['gif'],
  image: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'heic', 'avif', 'ico']
};

const KIND_BY_EXTENSION = new Map<string, VKFileKind>();
for(const kind of Object.keys(BY_EXTENSION) as (keyof typeof BY_EXTENSION)[]) {
  for(const ext of BY_EXTENSION[kind]) KIND_BY_EXTENSION.set(ext, kind);
}

/** «archive.tar.gz» → «gz», «noext» / «.hidden» / «name.» → '' */
export function getFileExtension(name?: string): string {
  if(!name) return '';
  const dot = name.lastIndexOf('.');
  if(dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** The extension decides first (a mime type of a file is often a generic one), the mime type second. */
export function getFileKind(name?: string, mimeType?: string): VKFileKind {
  const byExtension = KIND_BY_EXTENSION.get(getFileExtension(name));
  if(byExtension) return byExtension;

  const mime = (mimeType ?? '').toLowerCase();
  if(mime === 'image/gif') return 'gif';
  if(mime.startsWith('image/')) return 'image';
  if(mime.startsWith('video/')) return 'video';
  if(mime.startsWith('audio/')) return 'audio';
  if(mime === 'application/pdf') return 'pdf';
  if(mime === 'application/vnd.android.package-archive') return 'apk';
  if(mime === 'application/x-bittorrent') return 'torrent';
  if(/zip|rar|7z|tar|gzip|compressed/.test(mime)) return 'archive';
  if(mime.startsWith('text/')) return 'text';
  return 'file';
}

/**
 * Inner markup of each glyph: 24×24 grid, stroked with `currentColor`
 * (stroke 1.8, round caps and joins — the settings VKIcon puts on the svg).
 * `file`, `audio`, `video` and `image` are the sidebar's own «docs», «audio»,
 * «videos» and «photos» icons, unchanged (VKIcons.tsx); the rest are the same
 * page (`docs`: body + folded corner) with a small sign inside.
 */
const PAGE = '<path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5L14 3.5Z"/><path d="M14 3.5v4h4"/>';

export const FILE_ICON_MARKUP: {[kind in VKFileKind]: string} = {
  file: PAGE + '<line x1="9" y1="12.5" x2="15" y2="12.5"/><line x1="9" y1="16" x2="13" y2="16"/>',
  text: PAGE + '<line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="9" y1="17" x2="12.5" y2="17"/>',
  pdf: PAGE + '<path d="M9.5 18.5v-8h5v4.5h-5"/>',
  apk: PAGE + '<path d="M8.5 18.5V14h7v4.5Z"/><path d="M10.2 14v-2.2M13.8 14v-2.2"/>',
  archive: PAGE + '<path d="M12 10v1.8M12 13.6v1.4"/><rect x="10.2" y="15.8" width="3.6" height="3"/>',
  torrent: PAGE + '<path d="M12 10v7M9 14l3 3 3-3"/>',
  sheet: PAGE + '<path d="M8.5 11h7v8h-7Z"/><path d="M8.5 15h7M12 11v8"/>',
  code: PAGE + '<path d="M10.5 11.5 8 15l2.5 3.5M13.5 11.5 16 15l-2.5 3.5"/>',
  gif: PAGE + '<path d="M10 11v7l5.5-3.5Z"/>',
  audio: '<path d="M9 18V6.5l10-2V16"/><line x1="9" y1="10" x2="19" y2="8"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  video: '<rect x="3.5" y="6" width="12.5" height="12" rx="1.5"/><path d="m16 10.5 4.5-2.5v8L16 13.5"/>',
  image: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3 3-2.5L20 17"/>'
};

/** A complete `<svg>` string for code that builds DOM by hand. */
export function fileIconSvg(kind: VKFileKind, className = 'vk-file-icon'): string {
  return `<svg class="${className}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FILE_ICON_MARKUP[kind]}</svg>`;
}

const MONTHS = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const pad = (n: number) => String(n).padStart(2, '0');

/** «сегодня в 13:43», «вчера в 22:10», «29 сент. в 18:28», «3 янв. 2025 в 09:05» */
export function formatFileDate(unixSeconds: number, now: Date = new Date()): string {
  const date = new Date(unixSeconds * 1000);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if(days === 0) return `сегодня в ${time}`;
  if(days === 1) return `вчера в ${time}`;
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? `${day} в ${time}` : `${day} ${date.getFullYear()} в ${time}`;
}

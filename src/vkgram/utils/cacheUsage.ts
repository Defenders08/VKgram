/**
 * What Web K keeps on this device, counted from the browser's Cache Storage —
 * the same «Estimated storage quota» idea as Web K's own screen, but as numbers
 * the VKgram page draws itself.
 *
 * Web K keeps downloaded media in two caches: `cachedFiles` (photos, videos,
 * stickers, documents) and `cachedStreamChunks` (pieces of streamed video).
 * Each entry is a `Response` with `Content-Length` / `Content-Type`, so the
 * size and the kind come from the headers — no file is read into memory.
 * Clearing deletes the ENTRIES and leaves the cache itself in place: Web K
 * holds its cache open, a deleted cache would swallow its next writes.
 */

export type CacheUsage = {
  images: number,
  video: number,
  stickers: number,
  other: number,
  // `images + video + stickers + other`
  files: number,
  // pieces of streamed video, a cache of their own
  chunks: number
};

const FILES_CACHE = /^cachedFiles$/i;
const CHUNKS_CACHE = /stream/i;

// how many entries are looked at at once — enough to be quick, few enough to stay light
const BATCH = 40;

export const isCacheUsageSupported = () => typeof caches !== 'undefined';

type FileKind = 'images' | 'video' | 'stickers' | 'other';

/**
 * The kind of a cached file by its type. Telegram's stickers are WebP / TGS /
 * WebM, so those go to «Стикеры и эмодзи»; the rest follows the MIME family.
 */
function getFileKind(contentType: string): FileKind {
  const type = contentType.toLowerCase();
  if(/webp|tgsticker|x-tgs|lottie|^application\/json/.test(type) || type === 'video/webm') return 'stickers';
  if(type.startsWith('image/')) return 'images';
  if(type.startsWith('video/')) return 'video';
  return 'other';
}

async function getEntrySize(response: Response) {
  const length = Number(response.headers.get('Content-Length'));
  if(length > 0) return length;

  // a response without a length (rare): the only way is to read it
  try {
    return (await response.clone().blob()).size;
  } catch{
    return 0;
  }
}

async function openCaches(pattern: RegExp) {
  const names = (await caches.keys()).filter((name) => pattern.test(name));
  return Promise.all(names.map((name) => caches.open(name)));
}

async function walk(cache: Cache, callback: (response: Response) => Promise<void> | void) {
  const requests = await cache.keys();
  for(let i = 0; i < requests.length; i += BATCH) {
    await Promise.all(requests.slice(i, i + BATCH).map(async(request) => {
      const response = await cache.match(request);
      if(response) await callback(response);
    }));
  }
}

export async function measureCacheUsage(): Promise<CacheUsage> {
  const usage: CacheUsage = {images: 0, video: 0, stickers: 0, other: 0, files: 0, chunks: 0};

  for(const cache of await openCaches(FILES_CACHE)) {
    await walk(cache, async(response) => {
      const size = await getEntrySize(response);
      usage[getFileKind(response.headers.get('Content-Type') ?? '')] += size;
      usage.files += size;
    });
  }

  for(const cache of await openCaches(CHUNKS_CACHE)) {
    await walk(cache, async(response) => {
      usage.chunks += await getEntrySize(response);
    });
  }

  return usage;
}

export async function clearCacheEntries(which: 'files' | 'chunks') {
  for(const cache of await openCaches(which === 'files' ? FILES_CACHE : CHUNKS_CACHE)) {
    const requests = await cache.keys();
    for(let i = 0; i < requests.length; i += BATCH) {
      await Promise.all(requests.slice(i, i + BATCH).map((request) => cache.delete(request)));
    }
  }
}

/** «472,1 МБ» — the units and the decimal comma of the interface */
export function formatCacheSize(bytes: number) {
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  let value = bytes;
  let unit = 0;
  while(value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    ++unit;
  }

  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace('.', ',')} ${units[unit]}`;
}

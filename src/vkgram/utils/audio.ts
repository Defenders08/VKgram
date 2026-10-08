import type {MyDocument} from '@appManagers/appDocsManager';
import getAudioTitles from '@appManagers/utils/docs/getAudioTitles';

/** «Исполнитель — Название» of a track, as the profile music shows it */
export function formatAudioTitles(doc: MyDocument) {
  const titles = getAudioTitles(doc);
  if(!titles) return doc?.type === 'voice' ? 'Голосовое сообщение' : 'Аудио';
  return [titles.performer, titles.title].filter(Boolean).join(' — ');
}

/**
 * `m:ss` of a duration in seconds; empty when it is unknown. `pad`: `mm:ss`, the way
 * Web K's own audio rows write it, so the lists of a section read alike.
 */
export function formatDuration(seconds?: number, pad = false) {
  if(!seconds) return '';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return (pad ? String(minutes).padStart(2, '0') : minutes) + ':' + String(total % 60).padStart(2, '0');
}

/** `mm:ss` of a playback position in seconds; unlike `formatDuration`, a zero is written (`00:00`) */
export function formatTime(seconds?: number) {
  const total = Math.max(0, Math.floor(seconds || 0));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

import {createUniqueId, For, Show} from 'solid-js';
import {useAppSettings} from '@stores/appSettings';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';

type MediaKind = 'photo' | 'video' | 'file';
type ChatKind = 'contacts' | 'private' | 'groups' | 'channels';

const MEDIA: {id: MediaKind, title: string}[] = [
  {id: 'photo', title: 'Фотографии'},
  {id: 'video', title: 'Видео'},
  {id: 'file', title: 'Файлы'}
];

const CHATS: {id: ChatKind, title: string}[] = [
  {id: 'contacts', title: 'Контакты'},
  {id: 'private', title: 'Личные чаты'},
  {id: 'groups', title: 'Группы'},
  {id: 'channels', title: 'Каналы'}
];

const MB = 1024 * 1024;
// Web K's default: files up to 3 MB
const DEFAULT_FILE_LIMIT = 3 * MB;
const FILE_LIMITS = [1, 3, 10, 50, 100, 500, 1024, 2048].map((mb) => mb * MB);

const formatLimit = (bytes: number) => {
  const mb = bytes / MB;
  return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} ГБ` : `${+mb.toFixed(1)} МБ`.replace('.', ',');
};

/**
 * «Автозагрузка медиа» — Web K's auto-download rules (`appSettings.autoDownload`
 * per kind of media and kind of chat, `autoDownloadNew` for the master switch
 * and the file size limit), the same store its own screen writes to; every
 * change is applied at once. Drawn with the page's own pieces: the `Choice`
 * checkboxes of the feed settings, a `.vk-select`, a quiet link to reset.
 */
export default function VKSettingsAutoDownload() {
  const [settings, setSettings] = useAppSettings();
  // the store's setter takes a path whose typing is stricter than what is needed here
  const set = setSettings as (...args: any[]) => void;
  const selectId = createUniqueId();

  const isEnabled = () => !(settings as any).autoDownloadNew?.pFlags?.disabled;
  const isOn = (media: MediaKind, chat: ChatKind) => (settings as any).autoDownload?.[media]?.[chat] !== false;
  const fileLimit = (): number => (settings as any).autoDownloadNew?.file_size_max ?? DEFAULT_FILE_LIMIT;

  // the current limit stays in the list even if Web K's screen set an odd one
  const limits = () => {
    const current = fileLimit();
    return FILE_LIMITS.includes(current) ? FILE_LIMITS : [...FILE_LIMITS, current].sort((a, b) => a - b);
  };

  const isDefault = () => {
    return isEnabled() &&
      fileLimit() === DEFAULT_FILE_LIMIT &&
      MEDIA.every((media) => CHATS.every((chat) => isOn(media.id, chat.id)));
  };

  const reset = () => {
    set('autoDownloadNew', 'pFlags', 'disabled', false);
    set('autoDownloadNew', 'file_size_max', DEFAULT_FILE_LIMIT);
    for(const media of MEDIA) {
      for(const chat of CHATS) set('autoDownload', media.id, chat.id, true);
    }
  };

  return (
    <div class="vk-data-group">
      <div class="vk-data-head">
        <Choice
          type="checkbox"
          checked={isEnabled()}
          onChange={(checked) => set('autoDownloadNew', 'pFlags', 'disabled', !checked)}
        >
          Автоматически загружать медиа
        </Choice>
        <button type="button" class="vk-link-button" disabled={isDefault()} onClick={reset}>
          Сбросить
        </button>
      </div>

      <For each={MEDIA}>
        {(media) => (
          <fieldset class="vk-data-kind" disabled={!isEnabled()}>
            <legend class="vk-data-legend">{media.title}</legend>
            <div class="vk-data-checks">
              <For each={CHATS}>
                {(chat) => (
                  <Choice
                    type="checkbox"
                    checked={isOn(media.id, chat.id)}
                    onChange={(checked) => set('autoDownload', media.id, chat.id, checked)}
                  >
                    {chat.title}
                  </Choice>
                )}
              </For>
            </div>
            <Show when={media.id === 'file'}>
              <div class="vk-data-limit">
                <label for={selectId}>Размер файла до</label>
                <select
                  id={selectId}
                  class="vk-select"
                  value={fileLimit()}
                  onChange={(e) => set('autoDownloadNew', 'file_size_max', +e.currentTarget.value)}
                >
                  <For each={limits()}>
                    {(limit) => <option value={limit} selected={limit === fileLimit()}>{formatLimit(limit)}</option>}
                  </For>
                </select>
              </div>
            </Show>
          </fieldset>
        )}
      </For>

      <p class="vk-page-text vk-page-text-secondary">
        Голосовые сообщения маленькие, поэтому они всегда загружаются автоматически.
      </p>
    </div>
  );
}

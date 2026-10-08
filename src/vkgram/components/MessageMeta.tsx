import {Show} from 'solid-js';
import type {Message} from '@layer';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import formatNumber from '@helpers/number/formatNumber';
import VKIcon from '@/vkgram/components/VKIcons';

/**
 * Универсальный компонент для отображения метаданных сообщения.
 * Адаптируется в зависимости от варианта (чат или пост канала).
 */
export default function MessageMeta(props: {
  message: Message.message,
  variant: 'chat' | 'channel-post',
  // my message in a private chat: ✓ sent, ✓✓ read, a clock while it is being sent
  status?: 'pending' | 'sent' | 'read',
  showCommentsCount?: number,
  onCommentsClick?: () => void,
  // «Переслать» (Web K's forward popup); without it the button is not shown
  onForwardClick?: () => void
}) {
  const time = () => formatDateAccordingToTodayNew(new Date(props.message.date * 1000));

  // Для чатов — только время
  if(props.variant === 'chat') {
    return (
      <span class="vk-custom-message-meta">
        <time class="vk-custom-message-time">{time()}</time>
        <Show when={props.status}>
          <span
            class="vk-message-ticks"
            classList={{'is-read': props.status === 'read', 'is-pending': props.status === 'pending'}}
            title={props.status === 'read' ? 'Прочитано' : props.status === 'pending' ? 'Отправляется' : 'Доставлено'}
            aria-label={props.status === 'read' ? 'Прочитано' : props.status === 'pending' ? 'Отправляется' : 'Доставлено'}
          >
            <svg viewBox="0 0 16 11" width="14" height="10" aria-hidden="true">
              <path d="M1 5.6 4.4 9 11 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              <Show when={props.status === 'read'}>
                <path d="M7.2 8.4 8.4 9.4 15 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </Show>
            </svg>
          </span>
        </Show>
      </span>
    );
  }

  // Для постов каналов — полная метаинформация
  return (
    <footer class="vk-channel-post-meta vk-page-text-secondary">
      <Show when={props.showCommentsCount !== undefined}>
        <button
          type="button"
          class="vk-post-action vk-channel-post-comments"
          title="Комментарии"
          onClick={props.onCommentsClick}
        >
          <VKIcon name="discussion" size={15} />
          <span>{props.showCommentsCount ? `Комментарии: ${formatNumber(props.showCommentsCount, 1)}` : 'Комментировать'}</span>
        </button>
      </Show>
      <Show when={props.onForwardClick}>
        <button
          type="button"
          class="vk-post-action vk-channel-post-share"
          title="Переслать"
          aria-label="Переслать публикацию"
          onClick={props.onForwardClick}
        >
          <VKIcon name="forward" size={15} />
          <span>Переслать</span>
          <Show when={props.message.forwards}>
            <span class="vk-channel-post-share-count">{formatNumber(props.message.forwards!, 1)}</span>
          </Show>
        </button>
      </Show>
    </footer>
  );
}

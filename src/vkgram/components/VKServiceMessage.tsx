import {createEffect, createResource, JSX, on} from 'solid-js';
import wrapMessageActionTextNew from '@components/wrappers/messageActionTextNew';
import type {Message} from '@layer';

export default function VKServiceMessage(props: {
  message: Message.messageService,
  class?: string
}) {
  const [text, {refetch}] = createResource(() => wrapMessageActionTextNew({
    message: props.message
  }));
  createEffect(on(() => props.message, refetch));

  return (
    <div class={`vk-service-message ${props.class || ''}`} role="status" aria-label="Системное событие">
      <div class="vk-service-message-text">{text()}</div>
    </div>
  );
}

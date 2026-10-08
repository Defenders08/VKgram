import {createEffect, onCleanup} from 'solid-js';
import type {Message} from '@layer';
import wrapRichText from '@richTextProcessor/wrapRichText';
import {getMiddleware} from '@helpers/middleware';

/**
 * Универсальный компонент для рендеринга текста сообщения с entities.
 * Используется как в чатах, так и в постах каналов.
 */
export default function MessageText(props: {
  message: Message.message,
  class?: string
}) {
  let textEl!: HTMLDivElement;

  createEffect(() => {
    const message = props.message;
    const middlewareHelper = getMiddleware();
    onCleanup(() => middlewareHelper.destroy());

    const fragment = message.message
      ? wrapRichText(message.message, {
        entities: message.totalEntities ?? message.entities,
        middleware: middlewareHelper.get()
      })
      : document.createDocumentFragment();

    // Спойлеры раскрываются кликом: onSpoilerClick переключает класс на
    // ближайшем `.spoilers-container` — без обёртки классу некуда встать и
    // текст остаётся закрытым навсегда
    if(fragment.querySelector('.spoiler')) {
      const container = document.createElement('span');
      container.className = 'spoilers-container';
      container.append(fragment);
      textEl.replaceChildren(container);
    } else {
      textEl.replaceChildren(fragment);
    }
  });

  return <div ref={textEl} class={props.class} />;
}

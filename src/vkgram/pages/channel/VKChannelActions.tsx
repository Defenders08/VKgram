import {createEffect, createSignal, createUniqueId, For, onCleanup, Show} from 'solid-js';
import VKIcon, {VKIconName} from '@/vkgram/components/VKIcons';
import createChannelActions, {ChannelActions} from '@/vkgram/pages/channel/createChannelActions';

type MoreItem = {
  icon: VKIconName,
  title: string,
  onClick: () => unknown
};

const run = (action: () => unknown) => {
  Promise.resolve(action()).catch((err) => console.error('VKgram: channel action failed', err));
};

/**
 * The «⋯» next to «Покинуть канал»: a white card that drops under it with the rest
 * of what a channel can be asked — «Изменить» (only for those who may change the
 * channel), «Поделиться», «Забустить канал»,
 * «Отправить подарок», «Пожаловаться». Closes on a click outside, on Escape
 * and after a choice.
 */
function VKChannelMore(props: {actions: ChannelActions}) {
  const menuId = createUniqueId();
  const [isOpen, setOpen] = createSignal(false);

  let root!: HTMLDivElement;
  let button!: HTMLButtonElement;

  createEffect(() => {
    if(!isOpen()) return;

    const onPointerDown = (e: PointerEvent) => {
      if(!root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'Escape' || !isOpen()) return;
    e.stopPropagation();
    setOpen(false);
    button.focus();
  };

  const items = (): MoreItem[] => [
    // only for those who may change the channel
    ...(props.actions.canEdit() ? [{icon: 'edit', title: 'Изменить', onClick: props.actions.edit} as const] : []),
    {icon: 'share', title: 'Поделиться', onClick: props.actions.share},
    {icon: 'boost', title: 'Забустить канал', onClick: props.actions.boost},
    {icon: 'gift', title: 'Отправить подарок', onClick: props.actions.sendGift},
    {icon: 'flag', title: 'Пожаловаться', onClick: props.actions.report}
  ];

  return (
    <div ref={root} class="vk-channel-actions-more" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        class="vk-button vk-button-secondary vk-channel-action"
        title="Ещё"
        aria-label="Ещё"
        aria-haspopup="menu"
        aria-expanded={isOpen()}
        aria-controls={menuId}
        onClick={() => setOpen(!isOpen())}
      >
        <VKIcon name="more" size={18} />
      </button>

      <Show when={isOpen()}>
        <div id={menuId} class="vk-channel-menu">
          <div class="vk-news-settings-head">
            <span class="vk-news-settings-title">Действия с каналом</span>
          </div>
          <ul class="vk-channel-menu-list" role="menu">
            <For each={items()}>
              {(item) => (
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    class="vk-channel-menu-item"
                    onClick={() => {
                      setOpen(false);
                      run(item.onClick);
                    }}
                  >
                    <VKIcon name={item.icon} size={16} />
                    <span>{item.title}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

/**
 * The buttons of the channel page: «Обсуждение» with the notifications bell
 * beside it (when the channel has a discussion; the bell alone otherwise), and
 * the quiet (not blue) row: «Покинуть канал» (or «Подписаться» when the user is out of the
 * channel) with the «⋯» list of the other actions.
 */
export default function VKChannelActions(props: {peerId: PeerId}) {
  const actions = createChannelActions(props.peerId);

  return (
    <section class="vk-channel-actions" aria-label="Действия с каналом">
      <div class="vk-channel-actions-row">
        <Show when={actions.discussionPeerId()}>
          <button type="button" class="vk-button vk-channel-action vk-channel-action-grow" onClick={() => run(actions.viewDiscussion)}>
            Обсуждение
          </button>
        </Show>
        <Show when={actions.isMuted() !== undefined}>
          <button
            type="button"
            class="vk-button vk-channel-action vk-channel-action-icon"
            classList={{'vk-channel-action-grow': !actions.discussionPeerId()}}
            title={actions.isMuted() ? 'Включить уведомления' : 'Отключить уведомления'}
            aria-label={actions.isMuted() ? 'Включить уведомления' : 'Отключить уведомления'}
            aria-pressed={actions.isMuted()}
            onClick={() => run(actions.toggleMute)}
          >
            <VKIcon name={actions.isMuted() ? 'bell-off' : 'bell'} size={18} />
          </button>
        </Show>
      </div>

      <div class="vk-channel-actions-row">
        <button
          type="button"
          class="vk-button vk-button-secondary vk-channel-action vk-channel-action-grow"
          onClick={() => run(actions.isSubscribed() ? actions.leave : actions.join)}
        >
          {actions.isSubscribed() ? 'Покинуть канал' : 'Подписаться'}
        </button>
        <VKChannelMore actions={actions} />
      </div>
    </section>
  );
}

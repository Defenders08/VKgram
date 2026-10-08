import {createEffect, onCleanup, onMount} from 'solid-js';

const TELEGRAM_ACTIVE_CLASS = 'vkgram-telegram-active';

/**
 * «Телеграм» — the original Web K / Telegram Web shell.
 *
 * The shell is created by Web K outside VKgram and passed here as `host`.
 * We explicitly mount that real DOM node into this page instead of rendering
 * a placeholder, so the original Telegram Web UI is shown unchanged.
 */
export default function VKPageTelegram(props: {
  host?: HTMLElement,
  active: boolean
}) {
  let mountPoint: HTMLDivElement | undefined;

  const sync = () => {
    const active = props.active;
    document.documentElement.classList.toggle(TELEGRAM_ACTIVE_CLASS, active);

    const host = props.host;
    if(!host) return;

    if(mountPoint && host.parentElement !== mountPoint) {
      mountPoint.append(host);
    }

    host.classList.toggle('is-hidden', !active);
    host.inert = !active;
  };

  onMount(sync);

  createEffect(sync);

  onCleanup(() => {
    document.documentElement.classList.remove(TELEGRAM_ACTIVE_CLASS);
    const host = props.host;
    if(host) host.classList.remove('is-hidden');
  });

  return <div class="vk-telegram-page" ref={mountPoint}>{!props.host && <div class="vk-content-placeholder">Телеграм недоступен</div>}</div>;
}

import {JSX} from 'solid-js';

/**
 * VKgram's own section icons — thin line glyphs at home in the old VK left
 * menu (deliberately not Web K's `tgico` set: these belong to the VK look,
 * not to Telegram's). 24×24 viewBox, stroked with `currentColor`, so color
 * and size come from the surrounding control.
 */

export type VKIconName =
  | 'profile'
  | 'news'
  | 'messages'
  | 'friends'
  | 'groups'
  | 'channels'
  | 'settings'
  | 'search'
  | 'close'
  | 'more'
  | 'back';

const ICONS: {[name in VKIconName]: () => JSX.Element} = {
  profile: () => (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 19.5c0-3.3 3-5.2 7-5.2s7 1.9 7 5.2" />
    </>
  ),
  news: () => (
    <>
      <rect x="3.5" y="5" width="13" height="14" rx="1.5" />
      <path d="M16.5 8H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
      <line x1="7" y1="9" x2="13" y2="9" />
      <line x1="7" y1="12" x2="13" y2="12" />
      <line x1="7" y1="15" x2="10.5" y2="15" />
    </>
  ),
  messages: () => (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m5.5 8 5.3 3.8c.7.5 1.7.5 2.4 0L18.5 8" />
    </>
  ),
  friends: () => (
    <>
      <circle cx="9.5" cy="8.5" r="3.5" />
      <path d="M3.5 19.5c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2" />
      <path d="M16 5.3a3 3 0 0 1 0 5.9" />
      <path d="M17.5 14.7c1.9.6 3 2.1 3 4.3" />
    </>
  ),
  groups: () => (
    <>
      <circle cx="12" cy="9" r="3.4" />
      <path d="M6 19.5c0-3.1 2.7-4.9 6-4.9s6 1.8 6 4.9" />
      <path d="M6.4 6.2a2.7 2.7 0 0 0-.2 5.2" />
      <path d="M4.3 13.4c-1 .8-1.6 1.9-1.6 3.4" />
      <path d="M17.6 6.2a2.7 2.7 0 0 1 .2 5.2" />
      <path d="M19.7 13.4c1 .8 1.6 1.9 1.6 3.4" />
    </>
  ),
  channels: () => (
    <>
      <path d="M4 10v4h2.5L11 17.5v-11L6.5 10H4Z" />
      <path d="M14.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M17 7.5a6 6 0 0 1 0 9" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.28.63.9 1.04 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </>
  ),
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="20.5" y1="20.5" x2="16" y2="16" />
    </>
  ),
  close: () => (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  more: () => (
    <>
      <line x1="5" y1="12" x2="5.01" y2="12" />
      <line x1="12" y1="12" x2="12.01" y2="12" />
      <line x1="19" y1="12" x2="19.01" y2="12" />
    </>
  ),
  back: () => (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>
  )
};

export default function VKIcon(props: {name: VKIconName, size?: number, class?: string}) {
  return (
    <svg
      class={props.class}
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {ICONS[props.name]()}
    </svg>
  );
}

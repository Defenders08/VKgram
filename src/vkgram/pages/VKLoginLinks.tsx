import {For, Show} from 'solid-js';
import VKIcon, {VKIconName} from '@/vkgram/components/VKIcons';

/**
 * The project's contacts, shown under the sign-in block. Fill `href` in (a plain
 * `https://…` link, or `mailto:name@example.com` for the mail); a row whose
 * `href` is not set yet is shown quietly as «не указана» instead of a link, so
 * nothing on the page points to an address that is not real.
 */
type ContactLink = {
  id: 'github' | 'channel' | 'mail',
  title: string,
  note: string,
  href?: string
};

const LINKS: ContactLink[] = [
  {id: 'github', title: 'GitHub', note: 'Исходный код и обсуждение ошибок', href: 'https://github.com/Defenders08/VKgram'},
  {id: 'channel', title: 'Канал в Telegram', note: 'Новости и обновления', href: 'https://t.me/ashwtfyourmom'},
  {id: 'mail', title: 'Почта', note: 'Вопросы и предложения', href: 'mailto:vkgramproject@gmail.com'}
];

// what is shown under the title: the address without the scheme, `github.com/name/repo`
function readable(href: string) {
  return href.replace(/^(https?:\/\/|mailto:)/i, '').replace(/\/$/, '');
}

// the same icon tile as the features of the «about» block, smaller, with the
// project's own line icons: a document (the source), a megaphone (the channel),
// an envelope (the mail)
const ICON: Record<ContactLink['id'], VKIconName> = {
  github: 'docs',
  channel: 'channels',
  mail: 'messages'
};

function Tile(props: {id: ContactLink['id']}) {
  return (
    <span class="vk-login-tile" aria-hidden="true">
      <VKIcon name={ICON[props.id]} size={20} />
    </span>
  );
}

/**
 * A small VK block under the login form: the same title strip as the form
 * («Вход») and one row per contact. Static content, no part of the sign-in.
 */
export default function VKLoginLinks() {
  return (
    <nav class="vk-login-links" aria-labelledby="vk-login-links-title">
      <h2 id="vk-login-links-title" class="vk-login-links-head">Связь с проектом</h2>
      <ul class="vk-login-links-list">
        <For each={LINKS}>{(link) => (
          <li>
            <Show
              when={link.href}
              fallback={
                <div class="vk-login-links-row is-empty">
                  <Tile id={link.id} />
                  <span class="vk-login-links-text">
                    <span class="vk-login-links-title">{link.title}</span>
                    <span class="vk-login-links-note">Ссылка пока не указана</span>
                  </span>
                </div>
              }
            >
              <a
                class="vk-login-links-row"
                href={link.href}
                target={link.id === 'mail' ? undefined : '_blank'}
                rel="noopener noreferrer"
              >
                <Tile id={link.id} />
                <span class="vk-login-links-text">
                  <span class="vk-login-links-title">{link.title}</span>
                  <span class="vk-login-links-note">{readable(link.href!)}</span>
                </span>
              </a>
            </Show>
          </li>
        )}</For>
      </ul>
    </nav>
  );
}

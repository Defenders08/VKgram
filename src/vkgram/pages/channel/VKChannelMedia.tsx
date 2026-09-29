import {createMemo, For, Match, Show, Switch} from 'solid-js';
import type {Message, MessageEntity, MessageMedia, WebPage} from '@layer';
import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import formatNumber from '@helpers/number/formatNumber';
import {openWebKProfile} from '@/vkgram/webk';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import VKChannelPostMedia from '@/vkgram/pages/channel/VKChannelPostMedia';

export type VKChannelMaterialsKind = 'media' | 'files' | 'links' | 'music' | 'voice';

const KINDS: {[kind in VKChannelMaterialsKind]: {
  title: string,
  filter: MyInputMessagesFilter,
  limit: number,
  layout: 'grid' | 'list' | 'links'
}} = {
  media: {title: 'Медиа', filter: 'inputMessagesFilterPhotoVideo', limit: 8, layout: 'grid'},
  files: {title: 'Файлы', filter: 'inputMessagesFilterDocument', limit: 3, layout: 'list'},
  links: {title: 'Ссылки', filter: 'inputMessagesFilterUrl', limit: 5, layout: 'links'},
  music: {title: 'Музыка', filter: 'inputMessagesFilterMusic', limit: 3, layout: 'list'},
  voice: {title: 'Голосовые сообщения', filter: 'inputMessagesFilterVoice', limit: 3, layout: 'list'}
};

// a link of a message: the preview's page when there is one, else the first url in the text
function getLink(message: Message.message) {
  const webPage = (message.media as MessageMedia.messageMediaWebPage)?.webpage as WebPage.webPage;
  if(webPage?._ === 'webPage') {
    return {url: webPage.url, title: webPage.title || webPage.site_name || webPage.display_url || webPage.url};
  }

  const entities = (message.totalEntities ?? message.entities ?? []) as MessageEntity[];
  const entity = entities.find((entity) => entity._ === 'messageEntityUrl' || entity._ === 'messageEntityTextUrl');
  if(!entity) return;

  if(entity._ === 'messageEntityTextUrl') return {url: entity.url, title: entity.url};
  const text = message.message.slice(entity.offset, entity.offset + entity.length);
  return {url: /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : 'https://' + text, title: text};
}

/**
 * One material block of a channel («Медиа», «Файлы», «Ссылки», …): the latest
 * few items of the same server-side filter Web K's «Shared media» uses, and
 * the total from the same answer. A block with nothing to show is not drawn;
 * the rest of the material stays in Web K's own shared-media tab (the button).
 */
export default function VKChannelMedia(props: {peerId: PeerId, kind: VKChannelMaterialsKind}) {
  const config = KINDS[props.kind];
  const history = createChannelHistory({
    peerId: () => props.peerId,
    inputFilter: config.filter,
    pageSize: config.limit
  });

  const items = createMemo(() => history.messages().slice(0, config.limit));
  const total = () => history.count() ?? items().length;

  return (
    <Show when={history.status() === 'loaded' && items().length}>
      <section class={`vk-block vk-channel-${props.kind === 'media' ? 'media' : props.kind === 'links' ? 'links' : 'files'}`}>
        <h2 class="vk-block-title">
          {config.title}
          <span class="vk-page-text-secondary vk-list-count"> {formatNumber(total(), 1)}</span>
        </h2>

        <Switch>
          <Match when={config.layout === 'grid'}>
            <div class="vk-channel-media-grid">
              <For each={items()}>
                {(message) => <VKChannelPostMedia message={message} boxSize={120} />}
              </For>
            </div>
          </Match>

          <Match when={config.layout === 'list'}>
            <div class="vk-channel-files-list">
              <For each={items()}>
                {(message) => <VKChannelPostMedia message={message} />}
              </For>
            </div>
          </Match>

          <Match when={config.layout === 'links'}>
            <ul class="vk-channel-links-list">
              <For each={items().map(getLink).filter(Boolean)}>
                {(link) => (
                  <li>
                    <a href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</a>
                  </li>
                )}
              </For>
            </ul>
          </Match>
        </Switch>

        <Show when={total() > items().length}>
          <button type="button" class="vk-link-button" onClick={() => openWebKProfile(props.peerId)}>
            Показать все в «Сообщениях»
          </button>
        </Show>
      </section>
    </Show>
  );
}

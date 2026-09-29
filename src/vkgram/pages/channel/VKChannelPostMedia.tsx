import {createMemo, Match, Show, Switch} from 'solid-js';
import type {Message, MessageMedia, WebPage} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import getMediaFromMessage from '@appManagers/utils/messages/getMediaFromMessage';
import PhotoTsx from '@components/wrappers/photoTsx';
import VideoTsx from '@components/wrappers/videoTsx';
import DocumentTsx from '@components/wrappers/documentTsx';
import {openWebKMessage} from '@/vkgram/webk';

const BOX_SIZE = 560;

/**
 * Opens Web K's own media viewer (the one the chat and «Shared media» use) on
 * the message, with the same search context the chat gives it, so the viewer
 * pages through the channel's photos and videos by itself.
 */
export async function openChannelMedia(message: Message.message, target?: HTMLElement) {
  const {default: AppMediaViewer} = await import('@components/mediaViewer');
  new AppMediaViewer()
  .setSearchContext({
    peerId: message.peerId,
    inputFilter: {_: 'inputMessagesFilterPhotoVideo'},
    useSearch: true
  })
  .openMedia({message, target});
}

const getClickTarget = (event: MouseEvent) => {
  const container = event.currentTarget as HTMLElement;
  return container.querySelector<HTMLElement>('img, video, canvas') ?? container;
};

/**
 * The attachment of one publication, drawn by Web K's own wrappers (the ones
 * the chat bubbles use): photo, video / gif, any document (audio, voice,
 * file) and a link preview. Other kinds (poll, geo, contact, sticker, game,
 * invoice…) are not drawn here — a button opens that message in «Сообщения».
 */
export default function VKChannelPostMedia(props: {
  message: Message.message,
  // the longest side of a photo / video, px (a thumbnail in the media block, a full picture in a post)
  boxSize?: number
}) {
  const box = () => props.boxSize ?? BOX_SIZE;
  const kind = createMemo(() => {
    const media = props.message.media as MessageMedia;
    if(!media) return;

    switch(media._) {
      case 'messageMediaPhoto': {
        return getMediaFromMessage(props.message, true) ? 'photo' : 'other';
      }

      case 'messageMediaDocument': {
        const doc = getMediaFromMessage(props.message, true) as MyDocument;
        if(!doc) return 'other';
        if(doc.type === 'video' || doc.type === 'gif' || doc.type === 'round') return 'video';
        if(doc.type === 'sticker') return 'other';
        return 'document';
      }

      case 'messageMediaWebPage': {
        return (media.webpage as WebPage.webPage)?._ === 'webPage' ? 'link' : undefined;
      }

      case 'messageMediaEmpty': {
        return;
      }

      case 'messageMediaUnsupported': {
        return 'other';
      }

      default: {
        return 'other';
      }
    }
  });

  const photo = () => getMediaFromMessage(props.message, true);
  const doc = () => getMediaFromMessage(props.message, true) as MyDocument;
  const webPage = () => (props.message.media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage;

  return (
    <Show when={kind()}>
      <div class="vk-channel-post-media">
        <Switch>
          <Match when={kind() === 'photo'}>
            <PhotoTsx
              class="vk-channel-post-photo"
              photo={photo() as any}
              message={props.message}
              boxWidth={box()}
              boxHeight={box()}
              onClick={(event) => openChannelMedia(props.message, getClickTarget(event))}
            />
          </Match>

          <Match when={kind() === 'video'}>
            <VideoTsx
              class="vk-channel-post-video"
              doc={doc()}
              message={props.message}
              boxWidth={box()}
              boxHeight={box()}
              onClick={(event) => openChannelMedia(props.message, getClickTarget(event))}
            />
          </Match>

          <Match when={kind() === 'document'}>
            <DocumentTsx
              class="vk-channel-post-document"
              message={props.message}
              searchContext={{
                peerId: props.message.peerId,
                inputFilter: {_: 'inputMessagesFilterDocument'}
              }}
              autoDownloadSize={0}
              getSize={() => 320}
            />
          </Match>

          <Match when={kind() === 'link'}>
            <a class="vk-channel-post-link" href={webPage().url} target="_blank" rel="noopener noreferrer">
              <Show when={webPage().site_name}>
                <span class="vk-channel-post-link-site">{webPage().site_name}</span>
              </Show>
              <Show when={webPage().title}>
                <span class="vk-channel-post-link-title">{webPage().title}</span>
              </Show>
              <Show when={webPage().description}>
                <span class="vk-channel-post-link-description vk-page-text-secondary">{webPage().description}</span>
              </Show>
              <span class="vk-channel-post-link-url vk-page-text-secondary">{webPage().display_url || webPage().url}</span>
            </a>
          </Match>

          <Match when={kind() === 'other'}>
            <button
              type="button"
              class="vk-button vk-button-secondary"
              onClick={() => openWebKMessage(props.message.peerId, props.message.mid)}
            >
              Показать вложение в «Сообщениях»
            </button>
          </Match>
        </Switch>
      </div>
    </Show>
  );
}

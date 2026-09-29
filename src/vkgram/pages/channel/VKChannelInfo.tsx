import {createMemo, Show} from 'solid-js';
import type {Chat, ChatFull} from '@layer';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import wrapRichText from '@richTextProcessor/wrapRichText';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import {openWebKChat} from '@/vkgram/webk';

const AVATAR_SIZE = 120;

/**
 * Header and «Информация» of a channel. Everything comes from Web K's stores:
 * the channel from the reactive peer store, the rest from the full channel
 * (`appProfileManager.getProfileByPeerId` through `useFullPeer`). A field the
 * data doesn't have is not drawn.
 */
export default function VKChannelInfo(props: {peerId: PeerId, chat: Chat.channel}) {
  const peers = usePeers();
  const fullPeer = useFullPeer(props.peerId) as () => ChatFull.channelFull | undefined;

  const usernames = createMemo(() => getPeerActiveUsernames(props.chat));
  const username = () => usernames()[0];
  const link = () => username() ? `https://t.me/${username()}` : undefined;
  const isPublic = () => !!username();

  const subscribers = () => fullPeer()?.participants_count ?? props.chat.participants_count;
  const about = () => fullPeer()?.about;
  const isSubscribed = () => !props.chat.pFlags.left;

  const aboutWrapped = createMemo(() => about() ? wrapRichText(about()) : undefined);

  // the discussion group, when the store already knows it
  const discussionTitle = () => {
    const id = fullPeer()?.linked_chat_id;
    return id ? (peers[id.toPeerId(true)] as Chat.channel | Chat.chat)?.title : undefined;
  };

  return (
    <>
      <section class="vk-block vk-channel-header">
        <div class="vk-channel-avatar">
          <AvatarNewTsx peerId={props.peerId} size={AVATAR_SIZE} />
        </div>

        <div class="vk-channel-header-text">
          <h1 class="vk-page-title vk-channel-title">
            {props.chat.title}
            <Show when={props.chat.pFlags.verified}>
              <span class="vk-peer-flag" title="Подтверждён"> ✔</span>
            </Show>
          </h1>
          <Show when={username()}>
            <div class="vk-page-text-secondary">@{username()}</div>
          </Show>
          <Show when={aboutWrapped()}>
            <div class="vk-channel-description vk-page-text">{aboutWrapped()}</div>
          </Show>
          <Show when={subscribers()}>
            <div class="vk-channel-subscribers vk-page-text-secondary">
              {numberThousandSplitter(subscribers())} подписчиков
            </div>
          </Show>

          <div class="vk-profile-actions">
            <button type="button" class="vk-button" onClick={() => openWebKChat(props.peerId)}>
              Открыть в «Сообщениях»
            </button>
          </div>
        </div>
      </section>

      <section class="vk-block vk-channel-info" aria-labelledby="vk-channel-info-title">
        <h2 id="vk-channel-info-title" class="vk-block-title">Информация</h2>
        <dl class="vk-profile-info-list">
          <dt>Тип</dt>
          <dd>{isPublic() ? 'Публичный канал' : 'Частный канал'}</dd>

          <dt>Подписка</dt>
          <dd>{isSubscribed() ? 'Вы подписаны' : 'Вы не подписаны'}</dd>

          <Show when={link()}>
            <dt>Ссылка</dt>
            <dd><a href={link()} target="_blank" rel="noopener noreferrer">{link()}</a></dd>
          </Show>

          <Show when={usernames().length > 1}>
            <dt>Другие адреса</dt>
            <dd>{usernames().slice(1).map((name) => '@' + name).join(', ')}</dd>
          </Show>

          <Show when={discussionTitle()}>
            <dt>Обсуждение</dt>
            <dd>{discussionTitle()}</dd>
          </Show>

          <Show when={props.chat.pFlags.scam || props.chat.pFlags.fake}>
            <dt>Предупреждение</dt>
            <dd>{props.chat.pFlags.scam ? 'Telegram отметил канал как мошеннический' : 'Telegram отметил канал как поддельный'}</dd>
          </Show>
        </dl>
      </section>
    </>
  );
}

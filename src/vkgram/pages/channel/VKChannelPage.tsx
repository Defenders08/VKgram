import {Match, Switch} from 'solid-js';
import type {Chat} from '@layer';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {closeVKChannel} from '@/vkgram/pages/channel/route';
import VKChannelInfo from '@/vkgram/pages/channel/VKChannelInfo';
import VKChannelMedia from '@/vkgram/pages/channel/VKChannelMedia';
import VKChannelPosts from '@/vkgram/pages/channel/VKChannelPosts';

/**
 * A channel as a VKgram page: header, «Информация», material blocks
 * («Медиа», «Файлы», «Ссылки», …) and the feed of publications. It is not the
 * Web K chat — it only reads the same data. «← Каналы» goes back to the list
 * through the navigation stack (same as the browser's Back).
 */
export default function VKChannelPage(props: {peerId: PeerId}) {
  const peers = usePeers();
  const chat = () => peers[props.peerId] as Chat.channel;
  const fullPeer = useFullPeer(props.peerId);

  // a broadcast channel, not a group / megagroup / user
  const isChannel = () => chat()?._ === 'channel' && !chat().pFlags.megagroup && !chat().pFlags.monoforum;
  const pinnedMessageId = () => (fullPeer() as {pinned_msg_id?: number})?.pinned_msg_id;

  return (
    <div class="vk-page vk-channel-page">
      <button type="button" class="vk-link-button vk-channel-back" onClick={() => closeVKChannel()}>
        ← Каналы
      </button>

      <Switch>
        <Match when={!chat()}>
          <p class="vk-page-text vk-page-text-secondary">Загрузка канала…</p>
        </Match>

        <Match when={!isChannel()}>
          <p class="vk-page-text vk-page-text-secondary">Канал не найден.</p>
        </Match>

        <Match when={isChannel()}>
          <VKChannelInfo peerId={props.peerId} chat={chat()} />

          <VKChannelMedia peerId={props.peerId} kind="media" />
          <VKChannelMedia peerId={props.peerId} kind="files" />
          <VKChannelMedia peerId={props.peerId} kind="links" />
          <VKChannelMedia peerId={props.peerId} kind="music" />
          <VKChannelMedia peerId={props.peerId} kind="voice" />

          <VKChannelPosts peerId={props.peerId} pinnedMessageId={pinnedMessageId()} />
        </Match>
      </Switch>
    </div>
  );
}

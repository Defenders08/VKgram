import {createSignal, Match, Show, Switch} from 'solid-js';
import type {Chat} from '@layer';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {useMediaSizes} from '@helpers/mediaSizes';
import VKChannelInfo, {VKChannelAvatar, VKChannelDetails, VKChannelSummary} from '@/vkgram/pages/channel/VKChannelInfo';
import VKChannelActions from '@/vkgram/pages/channel/VKChannelActions';
import VKChannelMedia from '@/vkgram/pages/channel/VKChannelMedia';
import VKChannelFeed from '@/vkgram/pages/channel/VKChannelFeed';
import {VKProfileStories} from '@/vkgram/pages/profile/VKProfileStories';
import VKProfileGifts from '@/vkgram/pages/profile/VKProfileGifts';

/**
 * A channel as a VKgram page: «Информация», «Истории» and «Подарки» (only when
 * the channel has them), «Файлы» / «Музыка» / «Ссылки» and the «Лента» (posts +
 * media). It is not the Web K chat — it only reads the same data. Going back to
 * the list («← Каналы») and «Открыть в «Телеграм»» live in the top bar
 * (VKHeader), through the same navigation stack as the browser's Back.
 */
export default function VKChannelPage(props: {peerId: PeerId}) {
  const peers = usePeers();
  const sizes = useMediaSizes();
  const chat = () => peers[props.peerId] as Chat.channel;
  const fullPeer = useFullPeer(props.peerId);
  const [pageEl, setPageEl] = createSignal<HTMLElement>();

  // a broadcast channel, not a group / megagroup / user
  const isChannel = () => {
    const c = chat();
    return c?._ === 'channel' && !c.pFlags.megagroup && !c.pFlags.monoforum;
  };
  const pinnedMessageId = () => (fullPeer() as {pinned_msg_id?: number})?.pinned_msg_id;

  return (
    <div class="vk-page vk-channel-page" ref={setPageEl}>
      <Switch>
        <Match when={!chat()}>
          <p class="vk-page-text vk-page-text-secondary">Загрузка канала…</p>
        </Match>

        <Match when={!isChannel()}>
          <p class="vk-page-text vk-page-text-secondary">Канал не найден.</p>
        </Match>

        <Match when={isChannel()}>
          <Show
            when={sizes.isMobile}
            fallback={
              // desktop: two columns — the content on the left, the channel itself (avatar, files, links) on the right; its name and about are the first block of the content
              <div class="vk-cols">
                <div class="vk-col-main">
                  <VKChannelSummary peerId={props.peerId} chat={chat()} />
                  <VKChannelDetails peerId={props.peerId} chat={chat()} />
                  <VKProfileStories peerId={props.peerId} title="Истории" hideWhenEmpty />
                  <VKProfileGifts peerId={props.peerId} scrollParent={pageEl()} hideWhenEmpty />
                  <VKChannelMedia peerId={props.peerId} kind="music" />
                  <VKChannelFeed peerId={props.peerId} pinnedMessageId={pinnedMessageId()} />
                </div>
                <div class="vk-col-side">
                  <VKChannelAvatar peerId={props.peerId} />
                  <VKChannelActions peerId={props.peerId} />
                  <VKChannelMedia peerId={props.peerId} kind="files" />
                  <VKChannelMedia peerId={props.peerId} kind="links" />
                </div>
              </div>
            }
          >
            <VKChannelInfo peerId={props.peerId} chat={chat()} />

            <VKProfileStories peerId={props.peerId} title="Истории" hideWhenEmpty />
            <VKProfileGifts peerId={props.peerId} scrollParent={pageEl()} hideWhenEmpty />

            <VKChannelMedia peerId={props.peerId} kind="files" />
            <VKChannelMedia peerId={props.peerId} kind="music" />
            <VKChannelMedia peerId={props.peerId} kind="links" />

            <VKChannelFeed peerId={props.peerId} pinnedMessageId={pinnedMessageId()} />
          </Show>
        </Match>
      </Switch>
    </div>
  );
}

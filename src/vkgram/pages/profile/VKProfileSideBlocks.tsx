import {For, Show} from 'solid-js';
import type {Chat} from '@layer';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import {openVKSection} from '@/vkgram/sections';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import useSubscribedChannels, {useSubscribedGroups} from '@/vkgram/hooks/useSubscribedChannels';
import createCommonChats from '@/vkgram/hooks/createCommonChats';

const AVATAR_SIZE = 32;
const LIMIT = 5;

type MiniPeer = {peerId: PeerId, title?: string};

/**
 * A compact block of the narrow profile column: a title with a count, the
 * first few peers (small avatar + name), «Показать все» when there are more.
 * Nothing is drawn while there is nothing to list.
 */
function MiniPeerBlock(props: {
  title: string,
  total: number,
  peers: MiniPeer[],
  onOpen: (peerId: PeerId) => void,
  onShowAll?: () => void
}) {
  const peers = usePeers();
  const titleOf = (peer: MiniPeer) => (peers[peer.peerId] as Chat.channel | Chat.chat)?.title ?? peer.title;

  return (
    <Show when={props.peers.length}>
      <section class="vk-block vk-mini-block" aria-label={props.title}>
        <h2 class="vk-block-title">
          {props.title}
          <span class="vk-page-text-secondary vk-list-count"> {props.total}</span>
        </h2>

        <ul class="vk-mini-list">
          <For each={props.peers.slice(0, LIMIT)}>
            {(peer) => (
              <li>
                <button type="button" class="vk-mini-row" onClick={() => props.onOpen(peer.peerId)}>
                  <AvatarNewTsx peerId={peer.peerId} size={AVATAR_SIZE} />
                  <span class="vk-mini-name">{titleOf(peer)}</span>
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show when={props.onShowAll && props.total > LIMIT}>
          <button type="button" class="vk-link-button vk-mini-more" onClick={() => props.onShowAll()}>
            Показать все
          </button>
        </Show>
      </section>
    </Show>
  );
}

/** «Подписки» — the channels the user is subscribed to (the same list as «Каналы») */
export function VKProfileSubscriptions() {
  const {channels} = useSubscribedChannels();

  return (
    <MiniPeerBlock
      title="Подписки"
      total={channels().length}
      peers={channels().map((dialog) => ({peerId: dialog.peerId}))}
      onOpen={(peerId) => {
        openVKChannelPage(peerId);
      }}
      onShowAll={() => openVKSection('channels')}
    />
  );
}

/** «Группы» — the groups the user is a member of (the same list as «Группы») */
export function VKProfileGroups() {
  const {groups} = useSubscribedGroups();

  return (
    <MiniPeerBlock
      title="Группы"
      total={groups().length}
      peers={groups().map((dialog) => ({peerId: dialog.peerId}))}
      // there is no VKgram page of a group yet — the chat is what a group is (in VKgram's «Сообщения»)
      onOpen={(peerId) => openVKChat(peerId)}
      onShowAll={() => openVKSection('groups')}
    />
  );
}

/** «Общие группы» of another user — the groups both of us are in */
export function VKProfileCommonGroups(props: {peerId: PeerId, count?: number}) {
  const chats = createCommonChats({peerId: () => props.peerId, limit: LIMIT});

  return (
    <MiniPeerBlock
      title="Общие группы"
      total={Math.max(props.count ?? 0, chats()?.length ?? 0)}
      peers={chats() ?? []}
      onOpen={(peerId) => openVKChat(peerId)}
    />
  );
}

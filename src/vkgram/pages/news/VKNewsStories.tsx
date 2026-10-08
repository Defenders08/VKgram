import {createEffect, createRoot, createSignal, For, getOwner, onCleanup, Show} from 'solid-js';
import rootScope from '@lib/rootScope';
import {AvatarNewTsx} from '@components/avatarNew';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {StoriesProvider, useStories} from '@components/stories/store';
import type {PeerStories as ApiPeerStories} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {wrapStoryMedia} from '@components/stories/preview';

// the next page of peers is asked for when the strip is this close (px) to its end
const LOAD_MORE_DISTANCE = 180;
// a story is a card with a small avatar in a ring, on every screen (the inside of the ring, px)
const CARD_AVATAR_SIZE = 36;

type PeerStories = ReturnType<typeof useStories>[0]['peers'][0];

// every story of the peer is seen (my own ring never greys out, as in Telegram)
const isRead = (peer: PeerStories) => peer.peerId !== rootScope.myId &&
  !!peer.maxReadId && peer.maxReadId >= peer.stories[peer.stories.length - 1]?.id;

function StoriesStrip() {
  const [stories, actions] = useStories();
  const owner = getOwner();
  const items = new Map<PeerId, HTMLElement>();

  // the open viewer lives in its own root under this strip: the stories context is found through it
  let disposeViewer: () => void;
  onCleanup(() => disposeViewer?.());

  const open = async(peer: PeerStories) => {
    const {createStoriesViewer} = await import('@components/stories/viewer');
    disposeViewer?.();
    actions.resetIndexes();
    actions.set({peer});
    createRoot((dispose) => {
      disposeViewer = dispose;
      // the viewer flies out of (and back into) the avatar of the peer it shows
      createStoriesViewer({
        onExit: () => {
          dispose();
          if(disposeViewer === dispose) disposeViewer = undefined;
        },
        target: () => items.get(stories.peer?.peerId)?.querySelector('.avatar')
      });
    }, owner);
  };

  // the next page of peers comes as the strip is scrolled to its end
  const onScroll = (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    if(el.scrollLeft + el.clientWidth >= el.scrollWidth - LOAD_MORE_DISTANCE) actions.load();
  };

  return (
    <Show when={stories.peers.length}>
      <section class="vk-block vk-stories" aria-label="Истории">
        <div class="vk-stories-list" onScroll={onScroll}>
          <For each={stories.peers}>
            {(peer) => (
              <button
                ref={(el) => items.set(peer.peerId, el)}
                type="button"
                class="vk-stories-item"
                aria-label={peer.peerId === rootScope.myId ? 'Открыть мою историю' : undefined}
                classList={{'is-read': isRead(peer)}}
                onClick={() => open(peer)}
              >
                <div
                  class="vk-stories-media"
                  ref={(el) => {
                    const storyItem = peer.stories[0];
                    // a deleted story has no media to preview
                    if(storyItem?._ !== 'storyItem') return;
                    try {
                      const {container} = wrapStoryMedia({
                        peerId: peer.peerId,
                        storyItem,
                        forPreview: true,
                        noAspecter: true,
                        noPlayButton: true,
                        childrenClassName: 'vk-stories-media-content',
                        containerProps: {class: 'vk-stories-media-preview'}
                      });
                      if(container instanceof Node) el.append(container);
                    } catch(err) {
                      console.error('VKgram: failed to render story preview', err);
                    }
                  }}
                />
                <span class="vk-stories-avatar">
                  {/* Web K draws the avatar at the size it is given: the one the ring leaves */}
                  <AvatarNewTsx peerId={peer.peerId} size={CARD_AVATAR_SIZE} isDialog={false} />
                </span>
                <span class="vk-stories-name">
                  {peer.peerId === rootScope.myId ? 'Моя история' : <PeerTitleTsx peerId={peer.peerId} onlyFirstName />}
                </span>
              </button>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}

/**
 * Load the complete active story list instead of relying on Web K's sidebar
 * position filter. The Web K story store intentionally accepts only peers that
 * have a saved story-list position; that is useful for its own action bar, but
 * it makes a VKgram News block disappear when those positions are not ready.
 * `stories.getAllStories` is the actual full active list and includes users as
 * well as channels.
 */
function NewsStoriesProvider(props: {hidePeople: boolean}) {
  const [loaded, setLoaded] = createSignal<StoryPeer[]>();
  let requestId = 0;

  const load = async() => {
    const currentRequest = ++requestId;
    try {
      let state: string | undefined;
      const all = new Map<PeerId, StoryPeer>();

      do {
        const result = await rootScope.managers.appStoriesManager.getAllStories(
          state !== undefined,
          state,
          false
        );
        state = result.state;

        for(const peerStories of result.peer_stories as ApiPeerStories[]) {
          const peerId = getPeerId(peerStories.peer);
          const existing = all.get(peerId);
          const next = makeStoryPeer(peerStories);
          if(existing) existing.stories = [...existing.stories, ...next.stories];
          else all.set(peerId, next);
        }

        if(!result.pFlags.has_more) break;
      } while(state);

      const peers = [...all.values()].filter((peer) => {
        if(!props.hidePeople) return true;
        return !peer.isUser;
      });

      if(currentRequest === requestId) setLoaded(peers);
    } catch(err) {
      console.error('VKgram: failed to load News stories', err);
      if(currentRequest === requestId) setLoaded([]);
    }
  };

  createEffect(() => {
    props.hidePeople;
    load();
  });

  return (
    <For each={loaded() ? [loaded()!] : []}>
      {(peers) => (
        <StoriesProvider peers={peers} needUpdates>
          <StoriesStrip />
        </StoriesProvider>
      )}
    </For>
  );
}

type StoryPeer = ReturnType<typeof makeStoryPeer>;

function makeStoryPeer(peerStories: ApiPeerStories) {
  const stories = peerStories.stories.slice();
  const maxReadId = peerStories.max_read_id;
  return {
    peerId: getPeerId(peerStories.peer),
    stories,
    maxReadId,
    count: stories.length,
    index: Math.max(0, stories.findIndex((story) => story.id > (maxReadId || 0))),
    isUser: peerStories.peer._ === 'peerUser'
  };
}


/**
 * Stories at the top of «Новости». The setting is deliberately applied only
 * to this strip; it does not remove people from the News feed itself.
 */
export default function VKNewsStories(props: {hidePeople?: boolean}) {
  return <NewsStoriesProvider hidePeople={!!props.hidePeople} />;
}

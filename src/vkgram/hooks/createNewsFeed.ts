import {Accessor, createEffect, createMemo, createRoot, createSignal, on, onCleanup, untrack} from 'solid-js';
import type {Message} from '@layer';
import {FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import type useSubscribedChannels from '@/vkgram/hooks/useSubscribedChannels';
import createMutedPeers from '@/vkgram/hooks/createMutedPeers';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import groupPosts, {VKPost} from '@/vkgram/utils/groupPosts';
import getDialogLastMessage from '@/vkgram/utils/getDialogLastMessage';

// posts added to the feed at a time
const PAGE = 15;
// messages asked from one channel at a time
const CHANNEL_PAGE = 10;
// channels being read at the same moment
const MAX_IN_FLIGHT = 3;
// a request older than this (ms) is given up on: it must not hold one of the
// slots — and the order of the whole feed — forever
const LOAD_TIMEOUT = 20000;

type Source = {
  history: ReturnType<typeof createChannelHistory>,
  dispose: () => void
};

type SourceInfo = {
  peerId: PeerId,
  source?: Source,
  messages: Message.message[],
  // has this channel posts that are not loaded yet
  hasMore: boolean,
  isLoading: boolean,
  isFailed: boolean,
  // no unloaded post of this channel is newer than this (unix seconds)
  bound: number
};

export type VKNewsPost = VKPost & {key: string};

/**
 * Which channels make the feed.
 * `peerIds` — only these (the channels of a folder); without it, every channel
 * the user is subscribed to.
 * `hideArchived` / `hideMuted` — leave out the channels in the archive / with
 * notifications off.
 */
export type VKNewsRules = {
  peerIds?: Set<PeerId>,
  hideArchived: boolean,
  hideMuted: boolean
};

/**
 * The feed of «Новости»: the posts of every channel the user is subscribed to,
 * newest first, as one list.
 *
 * There is no «all channels» request in Telegram, so nothing new is asked
 * from the server: each channel is read through `createChannelHistory` — Web
 * K's own `getHistory`, with its paging and live updates (new post, edit,
 * views, reactions, deletion) — and the lists are merged by date here.
 *
 * Channels are read only as far as the order needs. For a channel not read
 * yet, the date of its last message (what the «Каналы» list shows) says how
 * new its posts can be at most; for a channel read partly, the date of the
 * oldest post it has. A post is put in the feed only when no unread post of
 * any channel can be newer than it, and the channel that could hold the
 * newest unread post is the next one to be read. So a feed of a hundred
 * channels asks only for the few that are really recent.
 */
export default function createNewsFeed(options: {
  // the user's channels: the page owns them, it needs the same list for its tabs
  source: ReturnType<typeof useSubscribedChannels>,
  rules: Accessor<VKNewsRules>
}) {
  const {channels: allChannels, isReady: areChannelsReady, notifyVersion} = options.source;
  const muted = createMutedPeers({peerIds: () => allChannels().map((dialog) => dialog.peerId), version: notifyVersion});

  // The rules decide which channels are in the feed at all: a channel that is
  // out is not read, not merged, not counted — nothing is hidden after the fact.
  // When muted channels are left out, one whose mute state is not known yet is out until it is.
  const channels = createMemo(() => {
    const {peerIds, hideArchived, hideMuted} = options.rules();
    return allChannels().filter((dialog) => {
      if(peerIds && !peerIds.has(dialog.peerId)) return false;
      if(hideArchived && dialog.folder_id === FOLDER_ID_ARCHIVE) return false;
      if(hideMuted && muted.isMuted(dialog.peerId) !== false) return false;
      return true;
    });
  });
  const isReady = () => areChannelsReady() && (!options.rules().hideMuted || muted.isResolved());

  // * the histories of the channels read so far
  const sources = new Map<PeerId, Source>();
  const [version, setVersion] = createSignal(0, {equals: false});
  const touch = () => setVersion(0);

  const ensureSource = (peerId: PeerId) => {
    if(sources.has(peerId)) return;
    sources.set(peerId, createRoot((dispose) => ({
      history: createChannelHistory({peerId: () => peerId, pageSize: CHANNEL_PAGE}),
      dispose
    })));
    touch();
  };

  // Channels whose request has been pending for too long. They count as failed
  // (not as «still loading»), so the other channels go on; an answer that does
  // come late, or «Повторить», brings them back.
  const stuck = new Set<PeerId>();
  const timers = new Set<number>();
  const watch = (peerId: PeerId) => {
    stuck.delete(peerId);
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      const history = sources.get(peerId)?.history;
      if(history && (history.status() === 'loading' || history.isLoadingMore())) {
        stuck.add(peerId);
        touch();
      }
    }, LOAD_TIMEOUT);
    timers.add(timer);
  };

  onCleanup(() => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
    sources.forEach((source) => source.dispose());
    sources.clear();
  });

  // a channel the user left is not read any more (one filtered out is kept: the tab may come back)
  createEffect(() => {
    const ids = new Set(allChannels().map((dialog) => dialog.peerId));
    let removed = false;
    for(const [peerId, source] of sources) {
      if(ids.has(peerId)) continue;
      source.dispose();
      sources.delete(peerId);
      removed = true;
    }

    if(removed) touch();
  });

  const infos = createMemo<SourceInfo[]>(() => {
    version();
    return channels().map((dialog): SourceInfo => {
      const peerId = dialog.peerId;
      const source = sources.get(peerId);
      // unknown date: it may be the newest of all, so it is read first
      const topDate = getDialogLastMessage(dialog)?.date ?? Infinity;
      if(!source) {
        return {peerId, messages: [], hasMore: true, isLoading: false, isFailed: false, bound: topDate};
      }

      const {history} = source;
      const status = history.status();
      if(status === 'error') {
        return {peerId, source, messages: [], hasMore: false, isLoading: false, isFailed: true, bound: -Infinity};
      }

      if(status === 'loading') {
        if(stuck.has(peerId)) {
          return {peerId, source, messages: [], hasMore: false, isLoading: false, isFailed: true, bound: -Infinity};
        }

        return {peerId, source, messages: [], hasMore: true, isLoading: true, isFailed: false, bound: topDate};
      }

      const allMessages = history.messages();
      const messages = allMessages.filter((m) => m._ === 'message') as Message.message[];
      const isLoading = history.isLoadingMore();
      // an older page that never comes: keep what is read, stop waiting for the rest
      const isStuck = isLoading && stuck.has(peerId);
      const hasMore = !isStuck && !history.isEnd() && messages.length > 0;
      return {
        peerId,
        source,
        messages,
        hasMore,
        isLoading: isLoading && !isStuck,
        isFailed: isStuck,
        // a channel's list is newest first
        bound: hasMore ? messages[messages.length - 1].date : -Infinity
      };
    });
  });

  // every loaded message, newest first; the same second keeps a channel's messages together (albums)
  const merged = createMemo(() => infos()
  .flatMap((info) => info.messages)
  .sort((a, b) => {
    if(b.date !== a.date) return b.date - a.date;
    if(a.peerId !== b.peerId) return Number(a.peerId) - Number(b.peerId);
    return b.mid - a.mid;
  }));

  // nothing newer than this can still be unread
  const frontier = createMemo(() => infos().reduce((max, info) => info.hasMore ? Math.max(max, info.bound) : max, -Infinity));

  const safePosts = createMemo<VKNewsPost[]>(() => {
    const limit = frontier();
    return groupPosts(merged().filter((message) => message.date >= limit)).map((post) => ({
      ...post,
      // a message id is only unique inside its channel
      key: `${post.messages[0].peerId}_${post.id}`
    }));
  });

  // * how much of it is shown
  const [limit, setLimit] = createSignal(PAGE);
  createEffect(on(options.rules, () => setLimit(PAGE), {defer: true}));
  const visible = createMemo(() => isReady() ? safePosts().slice(0, limit()) : []);

  // The list is keyed by the ids only, so a page of older posts (or a new view
  // count) doesn't re-create the posts already on screen along with their media.
  const postKeys = createMemo(() => visible().map((post) => post.key), [], {
    equals: (a, b) => a.length === b.length && a.every((key, index) => key === b[index])
  });
  const postsByKey = createMemo(() => new Map(visible().map((post) => [post.key, post])));

  // * read the channels the feed is short of
  createEffect(() => {
    if(!isReady() || safePosts().length >= limit()) return;

    const list = infos();
    const slots = MAX_IN_FLIGHT - list.filter((info) => info.isLoading).length;
    if(slots <= 0) return;

    const next = list
    .filter((info) => info.hasMore && !info.isLoading)
    .sort((a, b) => b.bound - a.bound)
    .slice(0, slots);

    untrack(() => {
      for(const info of next) {
        watch(info.peerId);
        if(info.source) info.source.history.loadMore();
        else ensureSource(info.peerId);
      }
    });
  });

  const isEnd = () => isReady() && !infos().some((info) => info.hasMore) && limit() >= safePosts().length;

  return {
    postKeys,
    getPost: (key: string) => postsByKey().get(key),
    isReady,
    // in the feed / subscribed at all (a feed can be empty because of the rules)
    channelCount: () => channels().length,
    totalChannelCount: () => allChannels().length,
    // what each filter would take out of the open tab's channels (`muted` is undefined until Web K answered)
    scopeStats: () => {
      const {peerIds} = options.rules();
      const scope = peerIds ? allChannels().filter((dialog) => peerIds.has(dialog.peerId)) : allChannels();
      return {
        archived: scope.filter((dialog) => dialog.folder_id === FOLDER_ID_ARCHIVE).length,
        muted: muted.isResolved() ? scope.filter((dialog) => muted.isMuted(dialog.peerId) === true).length : undefined
      };
    },
    // the channels of the open tab before the rules (all of them, or the folder's)
    scopeChannelCount: () => {
      const {peerIds} = options.rules();
      return peerIds ? allChannels().filter((dialog) => peerIds.has(dialog.peerId)).length : allChannels().length;
    },
    // nothing to show yet
    isLoading: () => !isReady() || (visible().length === 0 && infos().some((info) => info.hasMore)),
    // more is being read for the end of the list
    isLoadingMore: () => visible().length > 0 && !isEnd() && limit() > safePosts().length,
    isEnd,
    loadMore: () => {
      if(isEnd() || limit() > safePosts().length) return;
      setLimit((value) => value + PAGE);
    },
    // channels that could not be read
    failedCount: () => infos().filter((info) => info.isFailed).length,
    retry: () => infos().forEach((info) => {
      if(!info.isFailed || !info.source) return;
      watch(info.peerId);
      info.source.history.reload();
    })
  };
}

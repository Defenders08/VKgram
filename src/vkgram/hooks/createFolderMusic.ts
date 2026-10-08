import {Accessor, createEffect, createMemo, createSignal, on, onCleanup} from 'solid-js';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import {NULL_PEER_ID} from '@appManagers/constants';
import type {ChannelHistoryStatus} from '@/vkgram/pages/channel/createChannelHistory';

type PeerState = {
  // newest first
  messages: Message.message[],
  isEnd: boolean
};

// one page of one chat: the same `getHistory` call `createChannelHistory` makes with a filter
async function fetchPage(peerId: PeerId, inputFilter: MyInputMessagesFilter, last: Message.message | undefined, limit: number) {
  const result = await rootScope.managers.appMessagesManager.getHistory({
    peerId,
    limit,
    offsetId: last?.mid || 0,
    inputFilter: {_: inputFilter},
    offsetPeerId: last?.peerId || NULL_PEER_ID,
    nextRate: 0
  });

  const page = (result.messages ?? result.history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid)))
  .filter((message) => message?._ === 'message') as Message.message[];
  page.sort((a, b) => b.mid - a.mid);

  return {page, isEnd: !!result.isEnd?.top || !result.history.length};
}

/**
 * The media of several chats as ONE list, newest first — for a local folder of «Аудиозаписи».
 * Telegram has no search over a chosen set of chats, so each chat is read on its own
 * (`getHistory` with the filter, the same call the shared-media tabs run) and the pages are merged by date.
 *
 * The merge stays in order while it loads: a chat whose older items have not been read yet could
 * still hold something newer than what other chats already gave, so the list shows only what is
 * newer than the oldest item of every chat that has more (`horizon`). Asking for more reads the next
 * page of the chat that holds the list back.
 *
 * The answer has the shape of `createChannelHistory`, so a list can take either.
 */
export default function createFolderMusic(options: {
  peerIds: Accessor<PeerId[]>,
  inputFilter: MyInputMessagesFilter,
  pageSize?: number
}) {
  const pageSize = options.pageSize ?? 20;
  // ask again for older items at most this many times for one «more»: a list that does not grow stops
  const MAX_ROUNDS = 10;

  const [peers, setPeers] = createSignal(new Map<PeerId, PeerState>(), {equals: false});
  const [status, setStatus] = createSignal<ChannelHistoryStatus>('loading');
  const [isLoadingMore, setLoadingMore] = createSignal(false);

  // any answer of a request started before the chats changed is dropped
  let generation = 0;
  let busy = false;

  const put = (peerId: PeerId, state: PeerState) => setPeers((map) => map.set(peerId, state));

  // the next page of one chat; `false` when it could not be read
  const loadPeer = async(peerId: PeerId, current: number): Promise<boolean> => {
    const state = peers().get(peerId) ?? {messages: [], isEnd: false};
    try {
      const {page, isEnd} = await fetchPage(peerId, options.inputFilter, state.messages[state.messages.length - 1], pageSize);
      if(current !== generation) return true;

      const known = new Set(state.messages.map((message) => message.mid));
      const fresh = page.filter((message) => !known.has(message.mid));
      // a page that brought nothing new is the end (never ask for the same page forever)
      put(peerId, {messages: [...state.messages, ...fresh], isEnd: isEnd || !fresh.length});
      return true;
    } catch(err) {
      console.error('VKgram: failed to load the music of a folder chat', peerId, err);
      if(current === generation) put(peerId, {...state, isEnd: true});
      return false;
    }
  };

  const reload = async(): Promise<void> => {
    const current = ++generation;
    const peerIds = options.peerIds();
    busy = false;
    setLoadingMore(false);
    setPeers(new Map());
    setStatus('loading');

    const results = await Promise.all(peerIds.map((peerId) => loadPeer(peerId, current)));
    if(current !== generation) return;
    // all of the chats failed: that is an error; a part of them is a list with what could be read
    setStatus(peerIds.length && !results.some(Boolean) ? 'error' : 'loaded');
  };

  createEffect(on(() => options.peerIds().join(','), () => {
    void reload();
  }));
  onCleanup(() => {
    generation++;
  });

  const horizon = createMemo(() => {
    let date = 0;
    for(const state of peers().values()) {
      const oldest = state.messages[state.messages.length - 1];
      if(!state.isEnd && oldest) date = Math.max(date, oldest.date);
    }
    return date;
  });

  const messages = createMemo(() => {
    const from = horizon();
    const list: Message.message[] = [];
    for(const state of peers().values()) {
      for(const message of state.messages) {
        if(message.date >= from) list.push(message);
      }
    }
    return list.sort((a, b) => b.date - a.date || b.mid - a.mid);
  });

  const isEnd = createMemo(() => [...peers().values()].every((state) => state.isEnd));

  const loadMore = async(): Promise<void> => {
    if(busy || status() !== 'loaded' || isEnd()) return;

    const current = generation;
    busy = true;
    setLoadingMore(true);
    try {
      for(let round = 0; round < MAX_ROUNDS && current === generation; ++round) {
        const from = horizon();
        const before = messages().length;
        // the chats whose oldest item is the horizon are what holds the list back
        const holders = [...peers()]
        .filter(([, state]) => !state.isEnd && state.messages[state.messages.length - 1]?.date === from)
        .map(([peerId]) => peerId);
        if(!holders.length) break;

        await Promise.all(holders.map((peerId) => loadPeer(peerId, current)));
        if(messages().length > before || isEnd()) break;
      }
    } finally {
      if(current === generation) {
        busy = false;
        setLoadingMore(false);
      }
    }
  };

  // a deleted message leaves the list at once
  const onDelete = ({peerId, msgs}: {peerId: PeerId, msgs: Set<number>}) => {
    const state = peers().get(peerId);
    if(!state) return;
    put(peerId, {...state, messages: state.messages.filter((message) => !msgs.has(message.mid))});
  };
  rootScope.addEventListener('history_delete', onDelete);
  onCleanup(() => rootScope.removeEventListener('history_delete', onDelete));

  return {
    messages,
    status,
    isLoadingMore,
    isEnd,
    loadMore: (): void => void loadMore(),
    reload
  };
}

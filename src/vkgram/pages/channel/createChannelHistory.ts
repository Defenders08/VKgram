import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import {NULL_PEER_ID} from '@appManagers/constants';

export type ChannelHistoryStatus = 'loading' | 'loaded' | 'error';

/**
 * A channel's messages, newest first, read through Web K's own
 * `appMessagesManager.getHistory` (the call the chat and the shared-media tabs
 * use): the manager keeps the slices in its storage, so an already visited
 * channel answers from memory, and a page is only requested when asked for.
 *
 * Without `inputFilter` it is the channel's feed; with one (photos and videos,
 * documents, links…) it is the same search Web K's «Shared media» runs, paged
 * the same way (`offsetId` / `offsetPeerId` of the last item).
 *
 * The list follows Web K's events: a new post, an edit, new view counts and
 * reactions, deleted messages.
 */
export default function createChannelHistory(options: {
  peerId: Accessor<PeerId>,
  inputFilter?: MyInputMessagesFilter,
  pageSize?: number
}) {
  const pageSize = options.pageSize ?? 20;
  const listenerSetter = createListenerSetter();

  const [messages, setMessages] = createSignal<Message.message[]>([], {equals: false});
  const [status, setStatus] = createSignal<ChannelHistoryStatus>('loading');
  const [isLoadingMore, setLoadingMore] = createSignal(false);
  const [isEnd, setEnd] = createSignal(false);
  const [count, setCount] = createSignal<number>();

  // any answer of a request started before the peer changed is dropped
  let generation = 0;
  let loading = false;

  const getSorted = (list: Message.message[]) => list.sort((a, b) => b.mid - a.mid);

  const load = async(reset: boolean) => {
    if(loading && !reset) return;

    const peerId = options.peerId();
    if(!peerId) return;

    const current = ++generation;
    loading = true;

    if(reset) {
      setMessages([]);
      setEnd(false);
      setCount(undefined);
      setStatus('loading');
    } else {
      setLoadingMore(true);
    }

    try {
      const last = reset ? undefined : messages()[messages().length - 1];
      const result = await rootScope.managers.appMessagesManager.getHistory({
        peerId,
        limit: pageSize,
        offsetId: last?.mid || 0,
        ...(options.inputFilter ? {
          inputFilter: {_: options.inputFilter},
          offsetPeerId: last?.peerId || NULL_PEER_ID,
          nextRate: 0
        } : {})
      });
      if(current !== generation) return;

      // a mid can have no message behind it (deleted, a synthetic bound) — skip such holes;
      // service messages (channel created, photo changed…) are not publications
      const page = (result.messages ?? result.history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid)))
      .filter((message) => message?._ === 'message') as Message.message[];

      const known = new Set(reset ? [] : messages().map((message) => message.mid));
      const fresh = page.filter((message) => !known.has(message.mid));

      setMessages((list) => getSorted([...(reset ? [] : list), ...fresh]));
      setCount(result.count);
      // the end, or a page that brought nothing new (never ask for the same page forever)
      setEnd(!!result.isEnd?.top || !result.history.length || (!reset && !fresh.length && !page.length));
      setStatus('loaded');
    } catch(err) {
      if(current !== generation) return;
      console.error('VKgram: failed to load channel history', err);
      if(reset || !messages().length) setStatus('error');
      else setEnd(true); // keep what is shown, stop asking
    } finally {
      if(current === generation) {
        loading = false;
        setLoadingMore(false);
      }
    }
  };

  createEffect(on(options.peerId, () => {
    void load(true);
  }));
  onCleanup(() => {
    generation++;
  });

  // * live updates
  const matches = (message: {peerId?: PeerId, _?: string}) => message?.peerId === options.peerId();
  listenerSetter.add(rootScope)('history_append', ({message}) => {
    // a filtered list (shared media) is decided by the server; only the feed takes live posts
    if(options.inputFilter || !matches(message) || message._ !== 'message') return;
    setMessages((list) => list.some((item) => item.mid === message.mid) ? list : getSorted([...list, message]));
    setCount((value) => value === undefined ? value : value + 1);
  });
  listenerSetter.add(rootScope)('message_edit', ({message}) => {
    if(!matches(message) || message._ !== 'message') return;
    setMessages((list) => list.map((item) => item.mid === message.mid ? message : item));
  });
  listenerSetter.add(rootScope)('messages_views', (updates) => {
    const peerId = options.peerId();
    const changed = updates.filter((update) => update.peerId === peerId);
    if(!changed.length) return;
    setMessages((list) => list.map((item) => {
      const update = changed.find((update) => update.mid === item.mid);
      return update ? {...item, views: update.views} : item;
    }));
  });
  listenerSetter.add(rootScope)('messages_reactions', (updates) => {
    const peerId = options.peerId();
    const changed = updates.filter((update) => update.message.peerId === peerId);
    if(!changed.length) return;
    setMessages((list) => list.map((item) => {
      const update = changed.find((update) => update.message.mid === item.mid);
      return update ? update.message as Message.message : item;
    }));
  });
  listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
    if(peerId !== options.peerId()) return;
    setMessages((list) => list.filter((item) => !msgs.has(item.mid)));
  });

  return {
    messages,
    status,
    isLoadingMore,
    isEnd,
    count,
    loadMore: () => {
      if(status() === 'loaded' && !isEnd()) void load(false);
    },
    reload: () => load(true)
  };
}

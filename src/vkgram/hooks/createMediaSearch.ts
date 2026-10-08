import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import {NULL_PEER_ID} from '@appManagers/constants';
import type {ChannelHistoryStatus} from '@/vkgram/pages/channel/createChannelHistory';

/**
 * Media of every chat of the user — Telegram's global search, the one Web K's
 * search «Медиа», «Файлы», «Музыка», «Голосовые» tabs run: the same
 * `appMessagesManager.getHistory` without a peer (→ `messages.searchGlobal`),
 * one filter, paged the same way (the last item's id and peer, plus the
 * server's `nextRate`). An empty query lists the latest media of all chats,
 * a query narrows them down.
 *
 * The answer has the shape of `createChannelHistory`, so a list can take
 * either (the saved messages are read by that one).
 */
export default function createMediaSearch(options: {
  query: Accessor<string>,
  inputFilter: MyInputMessagesFilter,
  pageSize?: number
}) {
  const pageSize = options.pageSize ?? 30;

  const [messages, setMessages] = createSignal<Message.message[]>([], {equals: false});
  const [status, setStatus] = createSignal<ChannelHistoryStatus>('loading');
  const [isLoadingMore, setLoadingMore] = createSignal(false);
  const [isEnd, setEnd] = createSignal(false);
  const [count, setCount] = createSignal<number>();

  // any answer of a request started before the query changed is dropped
  let generation = 0;
  let loading = false;
  let nextRate = 0;

  const load = async(reset: boolean) => {
    if(loading && !reset) return;

    const current = ++generation;
    loading = true;

    if(reset) {
      nextRate = 0;
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
        peerId: NULL_PEER_ID,
        query: options.query().trim(),
        inputFilter: {_: options.inputFilter},
        offsetId: last?.mid || 0,
        offsetPeerId: last?.peerId || NULL_PEER_ID,
        nextRate,
        limit: pageSize
      });
      if(current !== generation) return;

      // a global answer comes with its messages (they are of many chats, a mid alone says nothing)
      const page = (result.messages ?? []).filter((message) => message?._ === 'message') as Message.message[];
      const key = (message: Message.message) => `${message.peerId}_${message.mid}`;
      const known = new Set(reset ? [] : messages().map(key));
      const fresh = page.filter((message) => !known.has(key(message)));

      // the server's order (newest first) is kept: it is by date across the chats
      setMessages((list) => [...(reset ? [] : list), ...fresh]);
      setCount(result.count);
      nextRate = result.nextRate || 0;
      // the end, or a page that brought nothing new (never ask for the same page forever)
      setEnd(!!result.isEnd?.top || result.history.length < pageSize || (!reset && !fresh.length));
      setStatus('loaded');
    } catch(err) {
      if(current !== generation) return;
      console.error('VKgram: global media search failed', err);
      if(reset || !messages().length) setStatus('error');
      else setEnd(true); // keep what is shown, stop asking
    } finally {
      if(current === generation) {
        loading = false;
        setLoadingMore(false);
      }
    }
  };

  createEffect(on(options.query, () => {
    void load(true);
  }));
  onCleanup(() => {
    generation++;
  });

  // a deleted message leaves the results at once
  const onDelete = ({peerId, msgs}: {peerId: PeerId, msgs: Set<number>}) => {
    setMessages((list) => list.filter((item) => item.peerId !== peerId || !msgs.has(item.mid)));
  };
  rootScope.addEventListener('history_delete', onDelete);
  onCleanup(() => rootScope.removeEventListener('history_delete', onDelete));

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

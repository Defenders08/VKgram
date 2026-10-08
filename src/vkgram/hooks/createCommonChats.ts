import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import rootScope from '@lib/rootScope';

export type CommonChat = {peerId: PeerId, title: string};

/**
 * The groups that both the signed-in user and `peerId` are in
 * (`appUsersManager.getCommonChats` → `messages.getCommonChats`, the list Web K
 * shows as «Groups in common»). The first `limit` of them, oldest id first — as
 * the server answers.
 *
 * NB: the manager's own `processResult` puts the chats into Web K's chats
 * storage (`saveApiChats`), so the reactive peer store knows them for the
 * avatars. If the request fails, the list is empty and the block is not drawn.
 */
export default function createCommonChats(options: {
  peerId: Accessor<PeerId>,
  limit: number
}) {
  const [chats, setChats] = createSignal<CommonChat[]>();

  let generation = 0;
  onCleanup(() => {
    generation++;
  });

  createEffect(on(options.peerId, async(peerId) => {
    const current = ++generation;
    setChats(undefined);
    if(!peerId) return;

    try {
      const managers = rootScope.managers;
      const result: any = await managers.appUsersManager.getCommonChats(peerId.toUserId(), options.limit);
      if(current !== generation) return;

      const apiChats: any[] = result?.chats ?? [];
      await managers.appChatsManager.saveApiChats(apiChats);
      if(current !== generation) return;

      setChats(apiChats
      .filter((chat) => chat?._ === 'chat' || chat?._ === 'channel')
      .map((chat) => ({peerId: (chat.id as ChatId).toPeerId(true), title: chat.title as string})));
    } catch(err) {
      if(current !== generation) return;
      console.error('VKgram: failed to load common chats', err);
      setChats([]);
    }
  }));

  return chats;
}

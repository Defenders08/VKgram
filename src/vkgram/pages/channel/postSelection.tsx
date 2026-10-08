import {createEffect, createRoot, createSignal, onCleanup, onMount, Show} from 'solid-js';
import {render} from 'solid-js/web';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import VKIcon from '@/vkgram/components/VKIcons';
import {canForwardPost} from '@/vkgram/pages/channel/forwardPost';

/**
 * «Выделить» in the menu of a post: the feed goes into the selection mode.
 * Every post (not only the one the menu was opened on) shows a checkbox next to
 * its ⋮; a bar at the bottom of the page counts the chosen posts and forwards
 * them or lets the selection go. One selection for the whole app — it is
 * module state, so the feed of «Новости» and the feed of a channel behave alike.
 */

const [selected, setSelected] = createSignal<ReadonlyMap<string, Message.message[]>>(new Map());
const [isSelecting, setSelecting] = createSignal(false);
// where the selection started: the feeds of posts, or the messages of an open chat (the bar of the
// chat stands above the composer and also offers «Удалить»)
const [context, setContext] = createSignal<'posts' | 'chat'>('posts');

export {isSelecting};

export const postKey = (messages: Message.message[]) => `${messages[0].peerId}_${messages[0].mid}`;

export const isPostSelected = (messages: Message.message[]) => selected().has(postKey(messages));

export const selectedCount = () => selected().size;

export function clearSelection() {
  setSelected(new Map());
  setSelecting(false);
}

export function togglePostSelection(messages: Message.message[]) {
  const key = postKey(messages);
  const next = new Map(selected());
  if(next.has(key)) next.delete(key);
  else next.set(key, messages);

  setSelected(next);
  // the last chosen post taken off ends the mode, as in Web K's chat
  if(!next.size) setSelecting(false);
}

export function startPostSelection(messages: Message.message[], kind: 'posts' | 'chat' = 'posts') {
  ensureBar();
  setContext(kind);
  setSelecting(true);
  if(!isPostSelected(messages)) togglePostSelection(messages);
  setSelecting(true);
}

async function forwardSelected() {
  const posts = [...selected().values()];
  if(!posts.length) return;

  const byPeer: {[peerId: string]: number[]} = {};
  for(const post of posts) {
    for(const message of post) (byPeer[message.peerId] ??= []).push(message.mid);
  }
  for(const mids of Object.values(byPeer)) mids.sort((a, b) => a - b);

  const {default: showForwardPopup} = await import('@components/popups/forward');
  showForwardPopup(byPeer);
  clearSelection();
}

async function deleteSelected() {
  const posts = [...selected().values()];
  if(!posts.length) return;

  const byPeer = new Map<PeerId, number[]>();
  for(const post of posts) {
    for(const message of post) {
      const mids = byPeer.get(message.peerId) ?? [];
      mids.push(message.mid);
      byPeer.set(message.peerId, mids);
    }
  }

  const [{default: showDeleteMessagesPopup}, {ChatType}] = await Promise.all([
    import('@components/popups/deleteMessages'),
    import('@components/chat/chatType')
  ]);
  for(const [peerId, mids] of byPeer) {
    mids.sort((a, b) => a - b);
    showDeleteMessagesPopup(peerId, mids, ChatType.Chat);
  }
  clearSelection();
}

function SelectionBar() {
  const [canForward, setCanForward] = createSignal(false);
  const [canDelete, setCanDelete] = createSignal(false);

  // the same for «Удалить»: only in a chat, and only when every chosen message may be deleted
  createEffect(() => {
    const posts = context() === 'chat' ? [...selected().values()] : [];
    Promise.all(posts.map((post) => Promise.all(post.map((message) => (
      rootScope.managers.appMessagesManager.canDeleteMessage(message).catch(() => false)
    ))).then((results) => results.every(Boolean)))).then((results) => {
      setCanDelete(results.length > 0 && results.every(Boolean));
    });
  });

  // can the chosen posts be forwarded at all (a channel can forbid it); re-checked when the set changes
  createEffect(() => {
    const posts = [...selected().values()];
    Promise.all(posts.map((post) => canForwardPost(post).catch(() => false))).then((results) => {
      setCanForward(results.length > 0 && results.every(Boolean));
    });
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key === 'Escape' && isSelecting()) clearSelection();
  };

  onMount(() => document.addEventListener('keydown', onKeyDown));
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));

  return (
    <Show when={isSelecting()}>
      <div class="vk-selection-bar" classList={{'is-chat': context() === 'chat'}} role="toolbar" aria-label="Выбранное">
        <span class="vk-selection-bar-count">
          Выбрано: <b>{selectedCount()}</b>
        </span>
        <Show when={canForward()}>
          <button type="button" class="vk-selection-bar-button" onClick={forwardSelected}>
            <VKIcon name="forward" size={16} />
            <span>Переслать</span>
          </button>
        </Show>
        <Show when={canDelete()}>
          <button type="button" class="vk-selection-bar-button is-danger" onClick={deleteSelected}>
            <VKIcon name="trash" size={16} />
            <span>Удалить</span>
          </button>
        </Show>
        <button type="button" class="vk-selection-bar-button is-quiet" onClick={clearSelection}>
          <VKIcon name="close" size={16} />
          <span>Отмена</span>
        </button>
      </div>
    </Show>
  );
}

let barMounted = false;

// the bar is mounted once, into the VKgram root (so it shares its theme and scope), on the first selection
function ensureBar() {
  if(barMounted) return;
  barMounted = true;
  const host = document.createElement('div');
  host.className = 'vk-selection-host';
  (document.querySelector('.vkgram') ?? document.body).append(host);
  createRoot(() => {
    render(() => <SelectionBar />, host);
  });
}

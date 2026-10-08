import {createEffect, createMemo, createResource, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import type {Message, MessageReactions, Reaction, ReactionCount} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import formatNumber from '@helpers/number/formatNumber';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import VKIcon from '@/vkgram/components/VKIcons';
import VKReactionGlyph, {isPickableReaction} from '@/vkgram/components/VKReactionGlyph';
import {toast} from '@components/toast';
import VKModal from '@/vkgram/components/VKModal';
import {openVKChat} from '@/vkgram/pages/messages/openChat';

const LIST_LIMIT = 100;

// a reaction as a map key: an emoji, a custom emoji or the paid star
const reactionKey = (reaction: Reaction) => reaction._ === 'reactionEmoji' ?
  reaction.emoticon :
  reaction._ === 'reactionCustomEmoji' ? 'custom:' + reaction.document_id : reaction._;
const PICKER_LIMIT = 12;
// a longer row collapses: the first chips inline, the rest behind «+N»
const COLLAPSED_LIMIT = 8;

/**
 * Reactions of one post, after its content: the reactions it already has (a
 * Telegram-style round chip with the count; the one I chose is filled), «+» with the reactions
 * the channel allows, and — where Telegram lets the viewer see it — who
 * reacted. Nothing here is VKgram's own: a click goes to Web K's
 * `appReactionsManager.sendReaction`, which adds, changes (another chip) or
 * removes (my own chip again) the reaction; the list of allowed reactions is
 * `getAvailableReactionsByMessage`, the users are `getMessageReactionsList`.
 * The state follows Web K's `messages_reactions` event and the manager's answer.
 */
export default function VKChannelPostReactions(props: {message: Message.message}) {
  const peers = usePeers();

  // the freshest reactions of this post: the event / the manager's answer win over the prop
  const [latest, setLatest] = createSignal<MessageReactions>();
  createEffect(on(() => props.message.reactions, () => setLatest(undefined), {defer: true}));

  const onReactions = (updates: {message: Message.message | {peerId: PeerId, mid: number}}[]) => {
    const update = updates.find(({message}) => message.peerId === props.message.peerId && message.mid === props.message.mid);
    if(update) setLatest((update.message as Message.message).reactions ?? {_: 'messageReactions', results: [], pFlags: {}});
  };
  onMount(() => {
    rootScope.addEventListener('messages_reactions', onReactions as any);
    onCleanup(() => rootScope.removeEventListener('messages_reactions', onReactions as any));
  });

  const reactions = () => latest() ?? props.message.reactions;
  const results = createMemo(() => (reactions()?.results || []).filter((result) => result.count > 0));
  const total = () => results().reduce((sum, result) => sum + result.count, 0);
  const canSeeList = () => !!reactions()?.pFlags?.can_see_list && total() > 0;

  // * Collapse of a long row: while folded, only the first chips are shown and my
  // own reaction is never hidden behind «+N» — it must stay reachable to undo it
  const [isExpanded, setExpanded] = createSignal(false);
  const visibleResults = () => {
    const all = results();
    if(isExpanded()) return all;
    const chosenIdx = all.findIndex((result) => result.chosen_order !== undefined);
    if(chosenIdx === -1 || chosenIdx < COLLAPSED_LIMIT) return all.slice(0, COLLAPSED_LIMIT);
    return [...all.slice(0, COLLAPSED_LIMIT - 1), all[chosenIdx]];
  };
  const hiddenCount = () => Math.max(0, results().length - visibleResults().length);

  const send = async(reaction: Reaction) => {
    // stars cost money: paid reactions are shown, never sent from here
    if(reaction._ === 'reactionPaid') return;
    try {
      const answer = await rootScope.managers.appReactionsManager.sendReaction({message: props.message, reaction});
      setLatest(answer ?? {_: 'messageReactions', results: [], pFlags: {}});
    } catch(err) {
      console.error('VKgram: sendReaction failed', err);
      toast('Не удалось поставить реакцию');
    }
  };

  // * «+»: the reactions this post can get (loaded once, Web K caches the channel's settings)
  const [available] = createResource(
    () => ({peerId: props.message.peerId, mid: props.message.mid}),
    async() => {
      try {
        const {reactions} = await rootScope.managers.appReactionsManager.getAvailableReactionsByMessage(props.message);
        // emoji and custom emoji the channel allows (a custom one needs Premium to be sent — Web K answers for it)
        return reactions.filter(isPickableReaction).slice(0, PICKER_LIMIT);
      } catch(err) {
        console.error('VKgram: getAvailableReactionsByMessage failed', err);
        return [];
      }
    }
  );

  // a mouse wheel scrolls the chips sideways (a trackpad / touch does it by itself)
  let scrollEl!: HTMLDivElement;
  const onWheel = (e: WheelEvent) => {
    if(Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = scrollEl.scrollWidth - scrollEl.clientWidth;
    if(max <= 0) return;
    const next = Math.min(max, Math.max(0, scrollEl.scrollLeft + e.deltaY));
    // at either end the wheel goes on scrolling the page
    if(next === scrollEl.scrollLeft) return;
    e.preventDefault();
    scrollEl.scrollLeft = next;
  };

  const [isPickerOpen, setPickerOpen] = createSignal(false);
  let pickerEl: HTMLDivElement;
  const onPointerDown = (e: PointerEvent) => {
    if(isPickerOpen() && !pickerEl.contains(e.target as Node)) setPickerOpen(false);
  };
  onMount(() => {
    // a delegated wheel listener is passive in Chrome: holding the page still
    // while the chips scroll takes a real non-passive one on the element
    scrollEl.addEventListener('wheel', onWheel, {passive: false});
    document.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => {
      scrollEl.removeEventListener('wheel', onWheel);
      document.removeEventListener('pointerdown', onPointerDown, true);
    });
  });

  // * «Кто поставил»
  const [isListOpen, setListOpen] = createSignal(false);
  const [filterKey, setFilterKey] = createSignal<string>();
  const closeList = () => {
    setListOpen(false);
    setFilterKey(undefined);
  };
  const [list] = createResource(
    () => isListOpen() && canSeeList() ? {peerId: props.message.peerId, mid: props.message.mid, total: total()} : undefined,
    async({peerId, mid}) => {
      try {
        const result = await rootScope.managers.appReactionsManager.getMessageReactionsList(peerId, mid, LIST_LIMIT);
        return result.reactions.map((item) => ({peerId: getPeerId(item.peer_id), reaction: item.reaction}));
      } catch(err) {
        console.error('VKgram: getMessageReactionsList failed', err);
        return [];
      }
    }
  );
  const shownList = () => {
    const key = filterKey();
    const all = list() ?? [];
    return key === undefined ? all : all.filter((item) => reactionKey(item.reaction) === key);
  };
  const peerTitle = (peerId: PeerId) => {
    const peer = peers[peerId] as {title?: string, first_name?: string, last_name?: string};
    return peer?.title ?? [peer?.first_name, peer?.last_name].filter(Boolean).join(' ');
  };

  return (
    <Show when={results().length || available()?.length}>
      <div class="vk-channel-post-reactions" classList={{'is-empty': !results().length}}>
        <div class="vk-reactions">
          {/* collapsed rows show the first chips and «+N»; expanded ones scroll sideways
              inside the strip («+» and «Кто поставил» stay beside it, the row stays one line) */}
          <Show when={results().length}>
          <div class="vk-reactions-scroll" ref={scrollEl}>
          <For each={visibleResults()}>
            {(result: ReactionCount) => (
              <button
                type="button"
                class="vk-reaction"
                classList={{'is-chosen': result.chosen_order !== undefined}}
                disabled={result.reaction._ === 'reactionPaid'}
                aria-pressed={result.chosen_order !== undefined}
                title={result.chosen_order !== undefined ? 'Убрать реакцию' : 'Поставить реакцию'}
                onClick={() => send(result.reaction)}
              >
                <span class="vk-reaction-glyph"><VKReactionGlyph reaction={result.reaction} size={16} /></span>
                <span class="vk-reaction-count">{formatNumber(result.count, 1)}</span>
              </button>
            )}
          </For>
          <Show when={results().length > COLLAPSED_LIMIT}>
            <button
              type="button"
              class="vk-reaction vk-reaction-more"
              aria-expanded={isExpanded()}
              title={isExpanded() ? 'Свернуть реакции' : `Показать ещё ${hiddenCount()}`}
              onClick={() => setExpanded((open) => !open)}
            >
              {isExpanded() ? '−' : `+${hiddenCount()}`}
            </button>
          </Show>
          </div>
          </Show>

          <Show when={available()?.length}>
            <div class="vk-reaction-picker-holder" ref={pickerEl}>
              <button
                type="button"
                class="vk-reaction vk-reaction-add"
                aria-haspopup="true"
                aria-expanded={isPickerOpen()}
                title="Добавить реакцию"
                aria-label="Добавить реакцию"
                onClick={() => setPickerOpen((open) => !open)}
                onKeyDown={(e) => e.key === 'Escape' && setPickerOpen(false)}
              >
                <VKIcon name="smile" size={16} />
              </button>
              <Show when={isPickerOpen()}>
                <div class="vk-reaction-picker vk-block" role="menu">
                  <For each={available()}>
                    {(reaction) => (
                      <button
                        type="button"
                        class="vk-reaction-picker-item"
                        role="menuitem"
                        onClick={() => {
                          setPickerOpen(false);
                          send(reaction);
                        }}
                      >
                        <VKReactionGlyph reaction={reaction} size={20} />
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          <Show when={canSeeList()}>
            <button
              type="button"
              class="vk-reactions-who"
              classList={{'is-open': isListOpen()}}
              aria-haspopup="dialog"
              aria-expanded={isListOpen()}
              onClick={() => setListOpen(true)}
            >
              <VKIcon name="friends" size={14} />
              <span>Кто поставил</span>
            </button>
          </Show>
        </div>

        <Show when={isListOpen() && canSeeList()}>
          <VKModal title="Кто поставил" width={400} closeOnBackdrop onClose={closeList}>
            <div class="vk-modal-body vk-reactions-modal">
              <div class="vk-reactions-modal-tabs" role="tablist">
                <button
                  type="button"
                  class="vk-reactions-modal-tab"
                  classList={{'is-active': filterKey() === undefined}}
                  role="tab"
                  aria-selected={filterKey() === undefined}
                  onClick={() => setFilterKey(undefined)}
                >
                  Все <span class="vk-reactions-modal-count">{formatNumber(total(), 1)}</span>
                </button>
                <For each={results()}>
                  {(result: ReactionCount) => (
                    <button
                      type="button"
                      class="vk-reactions-modal-tab"
                      classList={{'is-active': filterKey() === reactionKey(result.reaction)}}
                      role="tab"
                      aria-selected={filterKey() === reactionKey(result.reaction)}
                      onClick={() => setFilterKey(reactionKey(result.reaction))}
                    >
                      <VKReactionGlyph reaction={result.reaction} size={16} />
                      <span class="vk-reactions-modal-count">{formatNumber(result.count, 1)}</span>
                    </button>
                  )}
                </For>
              </div>
              <Show when={!list.loading} fallback={<p class="vk-page-text vk-page-text-secondary vk-reactions-modal-note">Загрузка…</p>}>
                <ul class="vk-peer-list vk-picker-list vk-reactions-list">
                  <For each={shownList()} fallback={<li class="vk-page-text vk-page-text-secondary vk-reactions-modal-note">Список недоступен.</li>}>
                    {(item) => (
                      <li>
                        <button
                          type="button"
                          class="vk-picker-row vk-reactions-list-item"
                          onClick={() => {
                            closeList();
                            openVKChat(item.peerId);
                          }}
                        >
                          <AvatarNewTsx peerId={item.peerId} size={36} />
                          <span class="vk-picker-info">
                            <span class="vk-picker-title">{peerTitle(item.peerId)}</span>
                          </span>
                          <span class="vk-reactions-list-glyph"><VKReactionGlyph reaction={item.reaction} size={20} /></span>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </VKModal>
        </Show>
      </div>
    </Show>
  );
}

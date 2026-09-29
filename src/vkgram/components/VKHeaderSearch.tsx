import {createMemo, createSignal, For, JSX, onCleanup, onMount, Show} from 'solid-js';
import type {Chat, User} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {openVKChannel} from '@/vkgram/pages/channel/route';
import {openWebKChat, openWebKProfile} from '@/vkgram/webk';
import useSubscribedChannels, {useSubscribedGroups} from '@/vkgram/hooks/useSubscribedChannels';
import useContactPeerIds from '@/vkgram/hooks/useContactPeerIds';
import matchesQuery from '@/vkgram/utils/matchesQuery';
import VKIcon from '@/vkgram/components/VKIcons';

const AVATAR_SIZE = 32;
const GROUP_LIMIT = 5;
const LIST_ID = 'vk-header-search-list';

type VKSearchResultKind = 'friend' | 'channel' | 'group';

type VKSearchResult = {
  key: string,
  kind: VKSearchResultKind,
  peerId: PeerId,
  title: string,
  sub?: string
};

const KIND_TITLES: {[kind in VKSearchResultKind]: string} = {
  friend: 'Друзья',
  channel: 'Каналы',
  group: 'Группы'
};

const KIND_SUBS: {[kind in VKSearchResultKind]: string} = {
  friend: 'друг',
  channel: 'канал',
  group: 'группа'
};

function pickResult(result: VKSearchResult) {
  if(result.kind === 'channel') openVKChannel(result.peerId);
  else if(result.kind === 'group') openWebKChat(result.peerId);
  else openWebKProfile(result.peerId);
}

/**
 * The header search of the old VK: one field over everything the user already
 * has — contacts, subscribed channels, groups. Local filtering only (the same
 * data the section pages list), a dropdown under the field, arrow keys +
 * Enter to pick. Nothing is sent to the server.
 */
export default function VKHeaderSearch() {
  const peers = usePeers();
  const contactIds = useContactPeerIds();
  const {channels, isReady: areChannelsReady} = useSubscribedChannels();
  const {groups} = useSubscribedGroups();

  const [query, setQuery] = createSignal('');
  const [isActive, setActive] = createSignal(false);
  const [activeIndex, setActiveIndex] = createSignal(-1);

  const results = createMemo<VKSearchResult[]>(() => {
    const text = query().trim();
    if(!text) return [];

    const list: VKSearchResult[] = [];

    const friends = (contactIds() ?? []).filter((peerId) => {
      const user = peers[peerId] as User.user;
      return user && matchesQuery(text, user.first_name, user.last_name, getPeerActiveUsernames(user));
    });
    for(const peerId of friends.slice(0, GROUP_LIMIT)) {
      const user = peers[peerId] as User.user;
      list.push({
        key: 'f' + peerId,
        kind: 'friend',
        peerId,
        title: [user.first_name, user.last_name].filter(Boolean).join(' '),
        sub: getPeerActiveUsernames(user)[0] ? '@' + getPeerActiveUsernames(user)[0] : undefined
      });
    }

    const channelDialogs = channels().filter((dialog) => {
      const chat = peers[dialog.peerId] as Chat.channel;
      return chat && matchesQuery(text, 'title' in chat ? chat.title : '', getPeerActiveUsernames(chat));
    });
    for(const dialog of channelDialogs.slice(0, GROUP_LIMIT)) {
      const chat = peers[dialog.peerId] as Chat.channel;
      list.push({
        key: 'c' + dialog.peerId,
        kind: 'channel',
        peerId: dialog.peerId,
        title: chat.title,
        sub: getPeerActiveUsernames(chat)[0] ? '@' + getPeerActiveUsernames(chat)[0] : undefined
      });
    }

    const groupDialogs = groups().filter((dialog) => {
      const chat = peers[dialog.peerId] as Chat;
      return chat && matchesQuery(text, 'title' in chat ? chat.title : '', getPeerActiveUsernames(chat));
    });
    for(const dialog of groupDialogs.slice(0, GROUP_LIMIT)) {
      const chat = peers[dialog.peerId] as Chat;
      list.push({
        key: 'g' + dialog.peerId,
        kind: 'group',
        peerId: dialog.peerId,
        title: (chat as Chat.channel).title,
        sub: undefined
      });
    }

    return list;
  });

  const isDropdownShown = () => isActive() && !!query().trim();
  const activeResult = () => results()[activeIndex()];

  createMemo(() => {
    results();
    setActiveIndex(-1);
  });

  const close = () => {
    setActive(false);
    setActiveIndex(-1);
  };

  const choose = (result: VKSearchResult) => {
    close();
    setQuery('');
    pickResult(result);
  };

  // a click outside the field closes the dropdown
  let wrapperEl: HTMLDivElement;
  const onPointerDown = (e: PointerEvent) => {
    if(isDropdownShown() && !wrapperEl.contains(e.target as Node)) close();
  };
  onMount(() => {
    document.addEventListener('pointerdown', onPointerDown, true);
    onCleanup(() => document.removeEventListener('pointerdown', onPointerDown, true));
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key === 'Escape') {
      if(isDropdownShown()) {
        e.stopPropagation();
        close();
      }
      return;
    }

    if(!isDropdownShown()) return;
    const count = results().length;
    if(!count) return;

    if(e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((index) => index + 1 >= count ? 0 : index + 1);
    } else if(e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((index) => index <= 0 ? count - 1 : index - 1);
    } else if(e.key === 'Enter') {
      const result = results()[activeIndex()] ?? results()[0];
      if(result) {
        e.preventDefault();
        choose(result);
      }
    }
  };

  const renderGroup = (kind: VKSearchResultKind, list: VKSearchResult[]): JSX.Element => (
    <li class="vk-header-search-group" role="presentation">
      <div class="vk-header-search-group-title" aria-hidden="true">{KIND_TITLES[kind]}</div>
      <ul class="vk-header-search-group-list" role="group" aria-label={KIND_TITLES[kind]}>
        <For each={list}>
          {(result) => (
            <li
              id={`vk-header-search-option-${result.key}`}
              role="option"
              aria-selected={activeResult()?.key === result.key}
            >
              <button
                type="button"
                class="vk-header-search-item"
                classList={{'is-active': activeResult()?.key === result.key}}
                tabindex="-1"
                onClick={() => choose(result)}
                onPointerEnter={() => setActiveIndex(results().indexOf(result))}
              >
                <AvatarNewTsx peerId={result.peerId} size={AVATAR_SIZE} />
                <span class="vk-header-search-item-info">
                  <span class="vk-header-search-item-title">{result.title}</span>
                  <span class="vk-header-search-item-sub">{result.sub ?? KIND_SUBS[result.kind]}</span>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </li>
  );

  return (
    <div class="vk-header-search" ref={wrapperEl}>
      <VKIcon name="search" size={15} class="vk-header-search-icon" />
      <input
        type="search"
        class="vk-header-search-input"
        value={query()}
        placeholder="Поиск"
        aria-label="Поиск"
        role="combobox"
        aria-expanded={isDropdownShown()}
        aria-controls={LIST_ID}
        aria-autocomplete="list"
        autocomplete="off"
        onInput={(e) => setQuery(e.currentTarget.value)}
        onFocus={() => setActive(true)}
        onKeyDown={onKeyDown}
        aria-activedescendant={activeIndex() >= 0 ? `vk-header-search-option-${results()[activeIndex()].key}` : undefined}
      />
      <Show when={isDropdownShown()}>
        <ul id={LIST_ID} class="vk-header-search-list vk-block" role="listbox" aria-label="Результаты поиска">
          <Show
            when={results().length}
            fallback={
              <li class="vk-header-search-empty" role="presentation">
                {areChannelsReady() || contactIds() ?
                  'Ничего не найдено.' :
                  'Поиск ещё загружается…'}
              </li>
            }
          >
            <For each={['friend', 'channel', 'group'] as VKSearchResultKind[]}>
              {(kind) => (
                <Show when={results().filter((result) => result.kind === kind)}>
                  {(list) => renderGroup(kind, list())}
                </Show>
              )}
            </For>
          </Show>
        </ul>
      </Show>
    </div>
  );
}

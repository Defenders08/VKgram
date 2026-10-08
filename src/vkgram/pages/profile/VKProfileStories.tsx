import {createEffect, createSignal, For, onCleanup, Show} from 'solid-js';
import type {StoryItem} from '@layer';
import rootScope from '@lib/rootScope';
import {wrapStoryMedia} from '@components/stories/preview';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import {formatFullSentTime} from '@helpers/date';
import VKTabs from '@/vkgram/components/VKTabs';

const ARCHIVE_PAGE = 12;
const PINNED_LIMIT = 50;

/**
 * «Публикации» of «Моя страница» (the active stories and the archive, two tabs of one block) and
 * the stories of other users — Telegram stories.
 * Data: appStoriesManager (active stories, the archive with its own paging).
 * Previews: Web K's wrapStoryMedia. Viewing: Web K's story viewer (it mounts
 * into the global #stories-viewer, so it opens over VKgram as is).
 *
 * Posting a story isn't here: Web K has no posting flow (stories.sendStory
 * is in the schema only), so there is nothing real to connect.
 */

function StoryThumb(props: {peerId: PeerId, storyItem: StoryItem.storyItem, onOpen: () => void}) {
  const {container} = wrapStoryMedia({
    peerId: props.peerId,
    storyItem: props.storyItem,
    forPreview: true,
    noAspecter: true,
    noPlayButton: true,
    childrenClassName: 'vk-story-thumb-media',
    containerProps: {
      'class': 'vk-story-thumb',
      'role': 'button',
      'tabindex': 0,
      'aria-label': 'Открыть публикацию, ' + formatFullSentTime(props.storyItem.date).textContent,
      'onClick': () => props.onOpen(),
      'onKeyDown': buttonKeyDown
    }
  });

  return container;
}

// re-reads the list whenever one of the peer's stories (mine by default) is added, changed or removed
function onPeerStoriesChange(peerId: PeerId, callback: () => void) {
  const onChange = (event: {peerId: PeerId}) => {
    if(event.peerId === peerId) callback();
  };
  rootScope.addEventListener('story_new', onChange);
  rootScope.addEventListener('story_update', onChange);
  rootScope.addEventListener('story_deleted', onChange);
  onCleanup(() => {
    rootScope.removeEventListener('story_new', onChange);
    rootScope.removeEventListener('story_update', onChange);
    rootScope.removeEventListener('story_deleted', onChange);
  });
}

// the stories of a peer (mine when it is me): the active ones, and for another user also the ones they pinned
function createPeerStories(peerId: () => PeerId) {
  const [stories, setStories] = createSignal<StoryItem.storyItem[]>();

  // another user's profile also shows the stories they pinned to it — the
  // ones no longer active; my own page keeps showing the active ones only
  const withPinned = () => peerId() !== rootScope.myId;
  const [activeIds, setActiveIds] = createSignal<Set<number>>(new Set());

  const load = async() => {
    let active: StoryItem.storyItem[] = [];
    try {
      const result = await rootScope.managers.appStoriesManager.getPeerStories(peerId());
      active = (result.stories as StoryItem[]).filter((story) => story._ === 'storyItem') as StoryItem.storyItem[];
    } catch(err) {
      console.error('VKgram: getPeerStories failed', err);
    }

    let pinned: StoryItem.storyItem[] = [];
    if(withPinned()) {
      try {
        const result = await rootScope.managers.appStoriesManager.getPinnedStories(peerId(), PINNED_LIMIT, 0);
        pinned = (result.stories as StoryItem[]).filter((story) => story._ === 'storyItem') as StoryItem.storyItem[];
      } catch(err) {
        console.error('VKgram: getPinnedStories failed', err);
      }
    }

    const ids = new Set(active.map((story) => story.id));
    setActiveIds(ids);
    setStories(active.concat(pinned.filter((story) => !ids.has(story.id))));
  };
  load();
  onPeerStoriesChange(peerId(), load);

  const open = async(storyItem: StoryItem.storyItem, index: number) => {
    const viewer = await import('@components/stories/viewer');
    // an active story opens in the peer's own stories (they get marked as seen)
    if(activeIds().has(storyItem.id)) {
      viewer.createStoriesViewerWithPeer({peerId: peerId(), id: storyItem.id});
      return;
    }

    // a pinned one is not among the active: the pinned list, starting at the clicked story
    const pinned = stories().filter((story) => !activeIds().has(story.id));
    viewer.createStoriesViewer({
      peers: [{peerId: peerId(), stories: pinned, index: pinned.indexOf(storyItem), count: pinned.length}],
      index: 0
    });
  };

  return {stories, open};
}

function StoriesGrid(props: {
  peerId: PeerId,
  stories: StoryItem.storyItem[] | undefined,
  empty: string,
  onOpen: (storyItem: StoryItem.storyItem, index: number) => void
}) {
  return (
    <Show when={props.stories} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      <Show when={props.stories.length} fallback={<p class="vk-page-text vk-page-text-secondary">{props.empty}</p>}>
        <div class="vk-story-grid">
          <For each={props.stories}>
            {(storyItem, index) => <StoryThumb peerId={props.peerId} storyItem={storyItem} onOpen={() => props.onOpen(storyItem, index())} />}
          </For>
        </div>
      </Show>
    </Show>
  );
}

export function VKProfileStories(props: {
  // whose stories; mine when omitted
  peerId?: PeerId,
  title?: string,
  // draw nothing while there is nothing to show (a channel without stories)
  hideWhenEmpty?: boolean
} = {}) {
  const peerId = () => props.peerId ?? rootScope.myId;
  const {stories, open} = createPeerStories(peerId);

  return (
    <Show when={!props.hideWhenEmpty || stories()?.length}>
      <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-stories-title">
        <h2 id="vk-profile-stories-title" class="vk-block-title">{props.title ?? 'Публикации'}</h2>
        <StoriesGrid peerId={peerId()} stories={stories()} empty="Пока нет публикаций." onOpen={open} />
      </section>
    </Show>
  );
}

function StoriesArchiveList() {
  const [stories, setStories] = createSignal<StoryItem.storyItem[]>();
  const [count, setCount] = createSignal(0);
  const [loading, setLoading] = createSignal(false);

  const loadPage = async(reset?: boolean) => {
    if(loading()) return;
    setLoading(true);
    try {
      const loaded = reset ? [] : stories() ?? [];
      const offsetId = loaded.length ? loaded[loaded.length - 1].id : 0;
      const result = await rootScope.managers.appStoriesManager.getStoriesArchive(rootScope.myId, ARCHIVE_PAGE, offsetId);
      setStories(loaded.concat(result.stories));
      setCount(result.count);
    } catch(err) {
      console.error('VKgram: getStoriesArchive failed', err);
    } finally {
      setLoading(false);
    }
  };
  loadPage(true);
  onPeerStoriesChange(rootScope.myId, () => loadPage(true));

  // the last tile of the row loads the next page by itself when the row's end comes into view (or is
  // in view at once, when the row is short): it is watched inside the row, which is the scroll box.
  // Every new page sets the watching anew, so a row that is still not full asks for one more. A page
  // that failed does not loop — the tile stays a button for a second try.
  const [moreTile, setMoreTile] = createSignal<HTMLButtonElement>();
  createEffect(() => {
    const tile = moreTile();
    stories();
    if(!tile) return;
    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting) && !loading()) loadPage();
    }, {root: tile.parentElement, rootMargin: '0px 240px 0px 0px'});
    observer.observe(tile);
    onCleanup(() => observer.disconnect());
  });

  // the archive as one list in the viewer, starting at the clicked story
  const open = async(index: number) => {
    const {createStoriesViewer} = await import('@components/stories/viewer');
    const list = stories();
    createStoriesViewer({
      peers: [{peerId: rootScope.myId, stories: list, index, count: list.length}],
      index: 0
    });
  };

  return (
    <Show when={stories()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      <Show when={stories().length} fallback={<p class="vk-page-text vk-page-text-secondary">Архив пуст.</p>}>
        <div class="vk-story-grid">
          <For each={stories()}>
            {(storyItem, index) => <StoryThumb peerId={rootScope.myId} storyItem={storyItem} onOpen={() => open(index())} />}
          </For>
          {/* the rest of the archive: the last tile of the row; it loads the next page when it is reached */}
          <Show when={stories().length < count()}>
            <button
              type="button"
              class="vk-story-more"
              classList={{'is-loading': loading()}}
              ref={setMoreTile}
              disabled={loading()}
              aria-busy={loading()}
              onClick={() => loadPage()}
            >
              <span class="vk-story-more-badge">
                <Show when={!loading()} fallback={<span class="vk-story-more-spinner" aria-hidden="true" />}>
                  +{count() - stories().length}
                </Show>
              </span>
              <span class="vk-story-more-label">{loading() ? 'Загрузка…' : 'Показать ещё'}</span>
            </button>
          </Show>
        </div>
      </Show>
    </Show>
  );
}

type MyStoriesTab = 'active' | 'archive';

const MY_STORIES_TABS: {id: MyStoriesTab, title: string}[] = [
  {id: 'active', title: 'Публикации'},
  {id: 'archive', title: 'Архив'}
];

/**
 * «Публикации» of «Моя страница»: my active stories and the archive of the old ones are one block
 * with two tabs. Both lists are read at once, so a tab opens without waiting. With no active stories
 * the archive is the open tab, until the user picks one.
 */
export function VKProfileMyStories(props: {
  // the id of the block in the page's blocks («Настройки» of the top bar)
  blockId?: string
}) {
  const {stories, open} = createPeerStories(() => rootScope.myId);
  // without a choice of its own the block opens on the active stories, or on the archive when there are none
  const [chosen, setChosen] = createSignal<MyStoriesTab>();
  const tab = (): MyStoriesTab => chosen() ?? (stories() && !stories().length ? 'archive' : 'active');

  return (
    <section class="vk-block vk-profile-section" aria-label="Публикации" data-vk-home-block={props.blockId}>
      <VKTabs idPrefix="vk-profile-stories" label="Публикации" tabs={MY_STORIES_TABS} active={tab()} onChange={setChosen} />

      <div id="vk-profile-stories-panel-active" role="tabpanel" aria-labelledby="vk-profile-stories-tab-active" hidden={tab() !== 'active'}>
        <StoriesGrid peerId={rootScope.myId} stories={stories()} empty="Пока нет публикаций." onOpen={open} />
      </div>
      <div id="vk-profile-stories-panel-archive" role="tabpanel" aria-labelledby="vk-profile-stories-tab-archive" hidden={tab() !== 'archive'}>
        <StoriesArchiveList />
      </div>
    </section>
  );
}

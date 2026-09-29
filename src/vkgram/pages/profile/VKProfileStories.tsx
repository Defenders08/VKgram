import {createSignal, For, onCleanup, Show} from 'solid-js';
import type {StoryItem} from '@layer';
import rootScope from '@lib/rootScope';
import {wrapStoryMedia} from '@components/stories/preview';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import {formatFullSentTime} from '@helpers/date';

const ARCHIVE_PAGE = 12;

/**
 * «Публикации» and «Архив публикаций» of «Моя страница» — Telegram stories.
 * Data: appStoriesManager (active stories, the archive with its own paging).
 * Previews: Web K's wrapStoryMedia. Viewing: Web K's story viewer (it mounts
 * into the global #stories-viewer, so it opens over VKgram as is).
 *
 * Posting a story isn't here: Web K has no posting flow (stories.sendStory
 * is in the schema only), so there is nothing real to connect.
 */

function StoryThumb(props: {storyItem: StoryItem.storyItem, onOpen: () => void}) {
  const {container} = wrapStoryMedia({
    peerId: rootScope.myId,
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

// re-reads the list whenever one of my stories is added, changed or removed
function onMyStoriesChange(callback: () => void) {
  const onChange = ({peerId}: {peerId: PeerId}) => {
    if(peerId === rootScope.myId) callback();
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

export function VKProfileStories() {
  const [stories, setStories] = createSignal<StoryItem.storyItem[]>();

  const load = async() => {
    const result = await rootScope.managers.appStoriesManager.getPeerStories(rootScope.myId);
    setStories(result.stories as StoryItem.storyItem[]);
  };
  load();
  onMyStoriesChange(load);

  const open = async(id: number) => {
    const {createStoriesViewerWithPeer} = await import('@components/stories/viewer');
    createStoriesViewerWithPeer({peerId: rootScope.myId, id});
  };

  return (
    <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-stories-title">
      <h2 id="vk-profile-stories-title" class="vk-block-title">Публикации</h2>
      <Show when={stories()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
        <Show when={stories().length} fallback={<p class="vk-page-text vk-page-text-secondary">Пока нет публикаций.</p>}>
          <div class="vk-story-grid">
            <For each={stories()}>
              {(storyItem) => <StoryThumb storyItem={storyItem} onOpen={() => open(storyItem.id)} />}
            </For>
          </div>
        </Show>
      </Show>
    </section>
  );
}

export function VKProfileStoriesArchive() {
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
    } finally {
      setLoading(false);
    }
  };
  loadPage(true);
  onMyStoriesChange(() => loadPage(true));

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
    <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-archive-title">
      <h2 id="vk-profile-archive-title" class="vk-block-title">Архив публикаций</h2>
      <Show when={stories()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
        <Show when={stories().length} fallback={<p class="vk-page-text vk-page-text-secondary">Архив пуст.</p>}>
          <div class="vk-story-grid">
            <For each={stories()}>
              {(storyItem, index) => <StoryThumb storyItem={storyItem} onOpen={() => open(index())} />}
            </For>
          </div>
          <Show when={stories().length < count()}>
            <div class="vk-profile-actions">
              <button type="button" class="vk-button vk-button-secondary" disabled={loading()} onClick={() => loadPage()}>
                {loading() ? 'Загрузка…' : `Показать ещё (${count() - stories().length})`}
              </button>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  );
}

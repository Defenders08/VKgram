import {createMemo, createResource, createSignal, For, Match, Show, Switch} from 'solid-js';
import type {Chat, Message} from '@layer';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import VKModal from '@/vkgram/components/VKModal';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';
import VKChannelPickerModal from '@/vkgram/components/VKChannelPickerModal';
import groupPosts, {type VKPost} from '@/vkgram/utils/groupPosts';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import VKChannelPost from '@/vkgram/pages/channel/VKChannelPost';
import useSubscribedChannels from '@/vkgram/hooks/useSubscribedChannels';
import {
  getVKHomeContentType,
  setVKHomePost,
  vkHomePost,
  VK_HOME_CONTENT_TYPES,
  type VKHomeContentType,
  type VKHomePost,
  type VKHomePostMode
} from '@/vkgram/pages/profile/homeSettings';

const isMessage = (message: unknown): message is Message.message => (message as Message.message)?._ === 'message';

const channelTitle = (peer: unknown) => (peer as Chat.channel | undefined)?.title;

// the newest posts read to find the first one / to pick from
const LATEST_PAGE = 12;
const PICKER_PAGE = 20;

/**
 * A «Пост канала» block of «Моя страница» (the user adds, moves and removes the blocks in the
 * «Настройки» of the top bar — `VKHeaderSettings`): one post of a channel in a wide block, drawn exactly as on
 * the channel's page (`VKChannelPost`: media, reactions, comments, the menu). Which channel and
 * which post — the newest, the pinned one or a chosen one — is the user's choice, kept locally
 * (`pages/profile/homeSettings`, the section «home» of the VKgram config).
 */
export default function VKProfileChannelPost(props: {id: string}) {
  const [isEditing, setEditing] = createSignal(false);
  const titleId = () => `vk-home-post-title-${props.id}`;
  const currentPost = () => vkHomePost(props.id);

  return (
    <section class="vk-block vk-profile-section vk-home-block" data-vk-home-block={props.id} aria-labelledby={titleId()}>
      <div class="vk-home-head">
        <h2 id={titleId()} class="vk-block-title">Пост канала</h2>
        <Show when={currentPost()}>
          <button type="button" class="vk-link-button vk-home-edit" aria-haspopup="dialog" onClick={() => setEditing(true)}>
            Изменить
          </button>
        </Show>
      </div>

      <Show
        when={currentPost()}
        keyed
        fallback={
          <>
            <p class="vk-page-text vk-page-text-secondary">
              Выберите канал и пост — он будет всегда на вашей странице.
            </p>
            <div class="vk-profile-actions">
              <button type="button" class="vk-button" aria-haspopup="dialog" onClick={() => setEditing(true)}>
                Выбрать пост
              </button>
            </div>
          </>
        }
      >
        {(post) => (
          <div class="vk-home-post-body">
            <Switch>
              <Match when={post.mode === 'latest'}><LatestPost peerId={post.peerId} type={post.type} /></Match>
              <Match when={post.mode === 'pinned'}><PinnedPost peerId={post.peerId} /></Match>
              <Match when={post.mode === 'post'}><ChosenPost peerId={post.peerId} mids={post.mids} /></Match>
            </Switch>
          </div>
        )}
      </Show>

      <Show when={isEditing()}>
        <VKChannelPostModal id={props.id} onClose={() => setEditing(false)} />
      </Show>
    </section>
  );
}

/** What a post shows while it is not there yet: a line of text (or the post). */
function PostView(props: {
  status: 'loading' | 'loaded' | 'error',
  messages?: Message.message[],
  empty: string,
  onRetry?: () => void
}) {
  return (
    <Switch>
      <Match when={props.messages?.length}>
        <VKChannelPost messages={props.messages} compact />
      </Match>
      <Match when={props.status === 'loading'}>
        <p class="vk-page-text vk-page-text-secondary">Загрузка публикации…</p>
      </Match>
      <Match when={props.status === 'error'}>
        <p class="vk-page-text vk-page-text-secondary">
          Не удалось загрузить публикацию.
          <Show when={props.onRetry}>
            {' '}
            <button type="button" class="vk-link-button" onClick={() => props.onRetry()}>Повторить</button>
          </Show>
        </p>
      </Match>
      <Match when={true}>
        <p class="vk-page-text vk-page-text-secondary">{props.empty}</p>
      </Match>
    </Switch>
  );
}

// * the newest post: follows the channel (a new post replaces it)
function LatestPost(props: {peerId: PeerId, type: VKHomeContentType}) {
  // with a type it is Telegram's own search of that kind of content in the channel
  const history = createChannelHistory({
    peerId: () => props.peerId,
    inputFilter: getVKHomeContentType(props.type).filter,
    pageSize: LATEST_PAGE
  });
  const first = createMemo(() => groupPosts(history.messages().filter(m => m._ === 'message') as Message.message[])[0]);

  return (
    <PostView
      status={history.status()}
      messages={first()?.messages}
      empty={props.type === 'any' ?
        'В канале пока нет публикаций.' :
        `В канале нет публикаций типа «${getVKHomeContentType(props.type).title}».`}
      onRetry={() => void history.reload()}
    />
  );
}

// * the pinned post: Web K knows the newest pin, the message itself comes from its storage
function PinnedPost(props: {peerId: PeerId}) {
  const [pinned] = createResource(() => props.peerId, async(peerId) => {
    try {
      const {maxId} = await rootScope.managers.appMessagesManager.getPinnedMessage(peerId);
      if(!maxId) return;
      const message = await rootScope.managers.appMessagesManager.getMessageByPeer(peerId, maxId);
      return isMessage(message) ? [message] : undefined;
    } catch(err) {
      console.error('VKgram: failed to load the pinned post of the home block', err);
    }
  });

  return (
    <PostView
      status={pinned.loading ? 'loading' : 'loaded'}
      messages={pinned.latest}
      empty="В канале нет закреплённой публикации."
    />
  );
}

// the messages of one post by their ids: Web K's storage first, then the channel's history
async function loadPostMessages(peerId: PeerId, mids: number[]) {
  const manager = rootScope.managers.appMessagesManager;
  let list = (await Promise.all(mids.map((mid) => manager.getMessageByPeer(peerId, mid)))).filter(isMessage);

  if(list.length < mids.length) {
    // the posts newest-first from the newest of the post (the offset is exclusive)
    const result = await manager.getHistory({peerId, limit: PICKER_PAGE, offsetId: Math.max(...mids) + 1});
    const page = (result.messages ?? result.history.map((mid) => apiManagerProxy.getMessageByPeer(peerId, mid)))
    .filter(isMessage)
    .filter((message) => mids.includes(message.mid));
    if(page.length > list.length) list = page;
  }

  // an album reads oldest first
  return list.sort((a, b) => a.mid - b.mid);
}

// * a chosen post: read once, then follows its edits, reactions, views and deletion
function ChosenPost(props: {peerId: PeerId, mids: number[]}) {
  const listenerSetter = createListenerSetter();
  const [messages, setMessages] = createSignal<Message.message[]>([], {equals: false});
  const [status, setStatus] = createSignal<'loading' | 'loaded' | 'error'>('loading');

  const load = async() => {
    setStatus('loading');
    try {
      setMessages(await loadPostMessages(props.peerId, props.mids));
      setStatus('loaded');
    } catch(err) {
      console.error('VKgram: failed to load the chosen post of the home block', err);
      setStatus('error');
    }
  };
  void load();

  const isOurs = (peerId: PeerId, mid: number) => peerId === props.peerId && props.mids.includes(mid);
  const replace = (message: Message.message) => {
    setMessages((list) => list.map((item) => item.mid === message.mid ? message : item));
  };
  listenerSetter.add(rootScope)('message_edit', ({message}) => {
    if(isMessage(message) && isOurs(message.peerId, message.mid)) replace(message);
  });
  listenerSetter.add(rootScope)('messages_reactions', (updates) => {
    updates.forEach((update) => {
      const message = update.message;
      if(isMessage(message) && isOurs(message.peerId, message.mid)) replace(message);
    });
  });
  listenerSetter.add(rootScope)('messages_views', (updates) => {
    const changed = updates.filter((update) => isOurs(update.peerId, update.mid));
    if(!changed.length) return;
    setMessages((list) => list.map((item) => {
      const update = changed.find((candidate) => candidate.mid === item.mid);
      return update ? {...item, views: update.views} : item;
    }));
  });
  listenerSetter.add(rootScope)('history_delete', ({peerId, msgs}) => {
    if(peerId !== props.peerId) return;
    setMessages((list) => list.filter((item) => !msgs.has(item.mid)));
  });

  return (
    <PostView
      status={status()}
      messages={messages()}
      empty="Эта публикация недоступна: возможно, она была удалена."
      onRetry={() => void load()}
    />
  );
}

// * the choice

const MODES: {id: VKHomePostMode, title: string}[] = [
  {id: 'latest', title: 'Последняя публикация'},
  {id: 'pinned', title: 'Закреплённая публикация'},
  {id: 'post', title: 'Выбранная публикация'}
];

/**
 * «Пост канала»: the channel (from those the user is subscribed to), then which of its posts.
 * A chosen post is picked from the newest of the channel (`VKPostPickerModal`). Nothing is saved
 * before «Сохранить».
 */
function VKChannelPostModal(props: {id: string, onClose: () => void}) {
  const peers = usePeers();
  const current = vkHomePost(props.id);
  const {channels} = useSubscribedChannels();

  const [peerId, setPeerId] = createSignal<PeerId | undefined>(current?.peerId);
  const [mode, setMode] = createSignal<VKHomePostMode>(current?.mode ?? 'latest');
  const [type, setType] = createSignal<VKHomeContentType>(current?.type ?? 'any');
  const [mids, setMids] = createSignal<number[]>(current?.mids ?? []);
  const [pickedLabel, setPickedLabel] = createSignal(current?.mode === 'post' ? 'Публикация выбрана' : '');
  const [step, setStep] = createSignal<'main' | 'channel' | 'post'>('main');

  const channelIds = createMemo(() => channels().map((dialog) => dialog.peerId.toChatId()));
  const canSave = () => !!peerId() && (mode() !== 'post' || mids().length > 0);

  const chooseMode = (next: VKHomePostMode) => {
    setMode(next);
    // «выбранная» without a post: straight to the choice
    if(next === 'post' && !mids().length && peerId()) setStep('post');
  };

  // a chosen post of another kind is not a choice any more: pick again
  const chooseType = (next: VKHomeContentType) => {
    if(next === type()) return;
    setType(next);
    if(mode() !== 'post') return;
    setMids([]);
    setPickedLabel('');
    setStep('post');
  };

  const save = () => {
    if(!canSave()) return;
    const post: VKHomePost = {peerId: peerId(), mode: mode(), type: type(), mids: mode() === 'post' ? mids() : []};
    setVKHomePost(props.id, post);
    props.onClose();
  };

  const clear = () => {
    setVKHomePost(props.id, null);
    props.onClose();
  };

  return (
    <Switch>
      <Match when={step() === 'channel'}>
        <VKChannelPickerModal
          title="Канал для блока"
          channelIds={channelIds()}
          currentId={peerId()?.toChatId()}
          onSelect={(chatId) => {
            const next = chatId.toPeerId(true);
            if(next === peerId()) return;
            // a post of the other channel is another post
            setPeerId(next);
            setMids([]);
            setPickedLabel('');
            if(mode() === 'post') setMode('latest');
          }}
          onClose={() => setStep('main')}
        />
      </Match>

      <Match when={step() === 'post' && peerId()}>
        <VKPostPickerModal
          peerId={peerId()}
          type={type()}
          selected={mids()}
          onPick={(post, label) => {
            setMids(post.messages.map((message) => message.mid));
            setPickedLabel(label);
            setMode('post');
          }}
          onClose={() => {
            setStep('main');
            // «Выбранная» without a chosen post is not a choice
            if(!mids().length && mode() === 'post') setMode('latest');
          }}
        />
      </Match>

      <Match when={true}>
        <VKModal title="Пост канала" width={440} onClose={props.onClose}>
          <div class="vk-modal-body vk-folder-create">
            <section class="vk-folder-section">
              <h3 class="vk-folder-section-title">Канал</h3>
              <Show when={peerId()}>
                <div class="vk-folder-chats">
                  <div class="vk-folder-chat">
                    <AvatarNewTsx peerId={peerId()} size={32} />
                    <span class="vk-folder-chat-title">{channelTitle(peers[peerId()]) || 'Канал'}</span>
                  </div>
                </div>
              </Show>
              <button type="button" class="vk-folder-add" onClick={() => setStep('channel')}>
                {peerId() ? 'Сменить канал' : 'Выбрать канал'}
              </button>
            </section>

            <Show when={peerId()}>
              <section class="vk-folder-section">
                <h3 class="vk-folder-section-title">Какую публикацию показывать</h3>
                <fieldset class="vk-settings-fieldset">
                  <For each={MODES}>
                    {(item) => (
                      <Choice
                        type="radio"
                        name="vk-home-post-mode"
                        checked={mode() === item.id}
                        onChange={(checked) => checked && chooseMode(item.id)}
                      >
                        {item.title}
                      </Choice>
                    )}
                  </For>
                </fieldset>

                <Show when={mode() !== 'pinned'}>
                  <h3 class="vk-folder-section-title vk-home-types-title">Тип контента</h3>
                  <fieldset class="vk-settings-fieldset vk-home-types">
                    <For each={VK_HOME_CONTENT_TYPES}>
                      {(item) => (
                        <Choice
                          type="radio"
                          name="vk-home-post-type"
                          checked={type() === item.id}
                          onChange={(checked) => checked && chooseType(item.id)}
                        >
                          {item.title}
                        </Choice>
                      )}
                    </For>
                  </fieldset>
                </Show>

                <Show when={mode() === 'post'}>
                  <p class="vk-folder-note vk-page-text-secondary">
                    {pickedLabel() || 'Публикация не выбрана.'}{' '}
                    <button type="button" class="vk-link-button" onClick={() => setStep('post')}>
                      {mids().length ? 'Выбрать другую' : 'Выбрать'}
                    </button>
                  </p>
                </Show>
                <p class="vk-folder-note vk-page-text-secondary">
                  Настройка хранится только в VKgram (в настройках приложения), в аккаунт Telegram она не пишется.
                </p>
              </section>
            </Show>
          </div>
          <div class="vk-modal-foot">
            <Show when={current}>
              <button type="button" class="vk-button vk-button-secondary" onClick={clear}>Убрать пост</button>
            </Show>
            <button type="button" class="vk-button vk-button-secondary" onClick={props.onClose}>Отмена</button>
            <button type="button" class="vk-button" disabled={!canSave()} onClick={save}>Сохранить</button>
          </div>
        </VKModal>
      </Match>
    </Switch>
  );
}

// a line to recognise a post by: its text, or what kind of media it is
const MEDIA_NAMES: {[type: string]: string} = {
  messageMediaPhoto: 'Фотография',
  messageMediaDocument: 'Файл',
  messageMediaPoll: 'Опрос',
  messageMediaWebPage: 'Ссылка'
};

function postLabel(post: VKPost) {
  const main = post.messages.find((message) => message.message) ?? post.messages[0];
  const text = main.message?.replace(/\s+/g, ' ').trim();
  if(text) return text.length > 90 ? text.slice(0, 90) + '…' : text;
  return MEDIA_NAMES[main.media?._] ?? 'Публикация без текста';
}

const postDate = (post: VKPost) => {
  return new Date(post.messages[0].date * 1000).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'});
};

/** The newest posts of a channel, one is picked (older ones come with «Показать ещё»). */
function VKPostPickerModal(props: {
  peerId: PeerId,
  type: VKHomeContentType,
  selected: number[],
  onPick: (post: VKPost, label: string) => void,
  onClose: () => void
}) {
  const history = createChannelHistory({
    peerId: () => props.peerId,
    inputFilter: getVKHomeContentType(props.type).filter,
    pageSize: PICKER_PAGE
  });
  const posts = createMemo(() => groupPosts(history.messages().filter(m => m._ === 'message') as Message.message[]));

  const pick = (post: VKPost) => {
    props.onPick(post, `${postDate(post)}: ${postLabel(post)}`);
    props.onClose();
  };

  return (
    <VKModal title={props.type === 'any' ? 'Выбор публикации' : `Выбор публикации: ${getVKHomeContentType(props.type).title}`} width={440} closeOnBackdrop onClose={props.onClose}>
      <div class="vk-modal-body vk-picker-body">
        <Switch>
          <Match when={history.status() === 'loading'}>
            <p class="vk-page-text vk-page-text-secondary">Загрузка…</p>
          </Match>
          <Match when={history.status() === 'error'}>
            <p class="vk-page-text vk-page-text-secondary">
              Не удалось загрузить публикации.{' '}
              <button type="button" class="vk-link-button" onClick={() => void history.reload()}>Повторить</button>
            </p>
          </Match>
          <Match when={!posts().length}>
            <p class="vk-page-text vk-page-text-secondary">
              {props.type === 'any' ? 'В канале пока нет публикаций.' : `В канале нет публикаций типа «${getVKHomeContentType(props.type).title}».`}
            </p>
          </Match>
          <Match when={true}>
            <ul class="vk-picker-list vk-chats-picker-list">
              <For each={posts()}>
                {(post) => (
                  <li>
                    <button
                      type="button"
                      class="vk-picker-row"
                      classList={{'is-current': post.messages.some((message) => props.selected.includes(message.mid))}}
                      aria-label={`${postDate(post)}: ${postLabel(post)}`}
                      onClick={() => pick(post)}
                    >
                      <span class="vk-picker-info">
                        <span class="vk-picker-title">{postLabel(post)}</span>
                        <span class="vk-page-text-secondary">{postDate(post)}</span>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <Show when={!history.isEnd()}>
              <button
                type="button"
                class="vk-link-button vk-chats-picker-more"
                disabled={history.isLoadingMore()}
                onClick={() => history.loadMore()}
              >
                {history.isLoadingMore() ? 'Загрузка…' : 'Показать ещё'}
              </button>
            </Show>
          </Match>
        </Switch>
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button vk-button-secondary" onClick={props.onClose}>Отмена</button>
      </div>
    </VKModal>
  );
}

import {createEffect, createSignal, Match, onCleanup, Show, Switch} from 'solid-js';
import {usePeers} from '@stores/peers';
import createFolderMusic from '@/vkgram/hooks/createFolderMusic';
import peerTitle from '@/vkgram/utils/peerTitle';
import VKEmptyState from '@/vkgram/components/VKEmptyState';
import {VKAudioRows} from '@/vkgram/components/VKAudioItem';
import type {VKAudioFolder} from '@/vkgram/pages/audio/settings';

// how many chat names are listed under the folder's head before «и ещё N»
const NAMES_SHOWN = 3;

/**
 * The tab of a local folder of «Аудиозаписи»: the music of the folder's chats and channels as
 * one list, newest first (`createFolderMusic`), in the same audio rows as the other tabs — what
 * plays is Web K's global player. Older items come as the end of the list comes near.
 */
export default function VKAudioFolderTab(props: {folder: VKAudioFolder, onEdit: () => void}) {
  const peers = usePeers();
  const list = createFolderMusic({peerIds: () => props.folder.peerIds, inputFilter: 'inputMessagesFilterMusic'});

  const chats = () => {
    const names = props.folder.peerIds.map((peerId) => peerTitle(peers[peerId] as any)).filter(Boolean) as string[];
    const rest = props.folder.peerIds.length - Math.min(names.length, NAMES_SHOWN);
    return names.slice(0, NAMES_SHOWN).join(', ') + (rest > 0 ? ` и ещё ${rest}` : '');
  };

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  createEffect(() => {
    const element = sentinel();
    // a new page re-arms the observer: a sentinel still in view has nothing to report by itself
    void list.messages().length;
    if(!element || list.status() !== 'loaded' || list.isEnd() || list.isLoadingMore()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) list.loadMore();
    }, {rootMargin: '400px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="vk-audio vk-audio-folder">
      <div class="vk-audio-folder-head">
        <p class="vk-page-text vk-page-text-secondary vk-audio-folder-chats">{chats()}</p>
        <button type="button" class="vk-link-button" onClick={props.onEdit}>Изменить</button>
      </div>

      <Switch>
        <Match when={list.status() === 'loading'}>
          <p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка…</p>
        </Match>

        <Match when={list.status() === 'error'}>
          <p class="vk-page-text vk-page-text-secondary vk-list-empty">
            Не удалось загрузить.{' '}
            <button type="button" class="vk-link-button" onClick={() => void list.reload()}>Повторить</button>
          </p>
        </Match>

        <Match when={!list.messages().length && list.isEnd()}>
          <VKEmptyState
            icon="audio"
            title="В этих чатах нет музыки"
            description="Измените состав папки или дождитесь новых аудиозаписей."
          />
        </Match>

        <Match when={true}>
          <VKAudioRows messages={list.messages()} />
        </Match>
      </Switch>

      <div ref={setSentinel} class="vk-list-sentinel" />
      <Show when={list.isLoadingMore()}>
        <p class="vk-page-text vk-page-text-secondary">Загрузка…</p>
      </Show>
    </div>
  );
}

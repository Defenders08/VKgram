import {For, Show} from 'solid-js';
import type {Chat} from '@layer';
import {usePeers} from '@stores/peers';
import VKIcon, {type VKIconName} from '@/vkgram/components/VKIcons';
import {Choice} from '@/vkgram/pages/news/VKNewsSettings';
import {animateIn, animateMove, animateOut, flash} from '@/vkgram/utils/animate';
import {
  addVKHomeBlock,
  isVKHomeBlocksFull,
  moveVKHomeBlock,
  removeVKHomeBlock,
  setVKHomeBlockHidden,
  setVKHomeInfoHidden,
  vkHomeHidePhone,
  vkHomeHideUsername,
  vkHomeBlocks,
  VK_HOME_MAX_BLOCKS,
  VK_HOME_SYSTEM_BLOCKS,
  type VKHomeBlock,
  type VKHomeBlockKind,
  type VKHomeSystemId
} from '@/vkgram/pages/profile/homeSettings';

const KINDS: {kind: VKHomeBlockKind, title: string, icon: VKIconName}[] = [
  {kind: 'pinned', title: 'Закреплено', icon: 'pin'},
  {kind: 'post', title: 'Пост канала', icon: 'news'}
];

// the glyph of a block of the page itself: what it is, at a glance
const SYSTEM_ICONS: {[id in VKHomeSystemId]: VKIconName} = {
  info: 'profile',
  music: 'audio',
  channel: 'channels',
  stories: 'photos',
  gifts: 'gift'
};

const plural = (count: number, forms: [string, string, string]) => {
  const last = count % 10;
  if(count % 100 >= 11 && count % 100 <= 14) return forms[2];
  return last === 1 ? forms[0] : last >= 2 && last <= 4 ? forms[1] : forms[2];
};

/**
 * The blocks of «Моя страница» (`pages/profile/homeSettings`) as a list to manage: every block in the
 * order of the page with arrows to move it, «глаз» to hide a block of the page itself or «×» to remove
 * one the user added, and the buttons that add a new one («Закреплено», «Пост канала») at the end.
 * Every change is applied at once, with a small animation on the page and in the list. It is the
 * content of «Настройки»: the panel under the gear (desktop, `VKHeaderSettings`) and the modal
 * (mobile, `VKHeaderSettingsMobile`).
 */
export default function VKHomeBlocksSettings() {
  const peers = usePeers();
  // blocks that are being folded up or brought back: a second click does nothing meanwhile
  const busy = new Set<string>();

  const titleOf = (block: VKHomeBlock) => {
    if(block.kind === 'system') return VK_HOME_SYSTEM_BLOCKS.find((item) => item.id === block.id).title;
    return KINDS.find((item) => item.kind === block.kind).title;
  };

  const iconOf = (block: VKHomeBlock): VKIconName => {
    return block.kind === 'system' ? SYSTEM_ICONS[block.id] : KINDS.find((item) => item.kind === block.kind).icon;
  };

  // what the block holds, in a few words under its name
  const detailOf = (block: VKHomeBlock) => {
    if(block.kind === 'system') return block.hidden ? 'скрыт' : 'показан';
    if(block.kind === 'pinned') {
      const count = block.peerIds.length;
      return count ? `${count} ${plural(count, ['чат', 'чата', 'чатов'])}` : 'пусто';
    }
    if(!block.post) return 'пост не выбран';
    return (peers[block.post.peerId] as Chat.channel | undefined)?.title || 'канал';
  };

  // the block on the page and its row in the panel
  const elementsOf = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-vk-home-block="${id}"]`)];
  const pageBlockOf = (id: string) => elementsOf(id).find((element) => element.tagName === 'SECTION');

  // a new block shows itself in the panel and on the page (the page scrolls to it if it is out of sight)
  const add = (kind: VKHomeBlockKind) => {
    const id = addVKHomeBlock(kind);
    if(!id) return;
    for(const element of elementsOf(id)) animateIn(element, {grow: element.tagName !== 'SECTION'});
    const block = pageBlockOf(id);
    block?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    if(block) flash(block);
  };

  // the arrows swap the block with its neighbour: both slide to the new places, the moved one is marked
  const move = (id: string, shift: -1 | 1) => {
    animateMove(
      () => [...document.querySelectorAll<HTMLElement>('[data-vk-home-block]')],
      () => moveVKHomeBlock(id, shift)
    );
    elementsOf(id).forEach(flash);
    pageBlockOf(id)?.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  };

  // the block folds up first, then it is taken out
  const remove = async(id: string) => {
    if(busy.has(id)) return;
    busy.add(id);
    await Promise.all(elementsOf(id).map(animateOut));
    removeVKHomeBlock(id);
    busy.delete(id);
  };

  // a block of the page itself: hidden it folds up and stays in the list (dimmed), shown again it
  // comes back to its place, the page scrolls to it
  const toggleHidden = async(id: string, hidden: boolean) => {
    if(busy.has(id)) return;
    busy.add(id);

    if(hidden) {
      const block = pageBlockOf(id);
      if(block) await animateOut(block);
      setVKHomeBlockHidden(id, true);
    } else {
      setVKHomeBlockHidden(id, false);
      const block = pageBlockOf(id);
      if(block) {
        animateIn(block);
        block.scrollIntoView({behavior: 'smooth', block: 'nearest'});
        flash(block);
      }
    }

    busy.delete(id);
  };

  const isFull = isVKHomeBlocksFull;

  return (
    <div class="vk-home-blocks">
      <div class="vk-home-blocks-legend">Блоки страницы</div>
      <Show
        when={vkHomeBlocks().length}
        fallback={<p class="vk-page-text vk-page-text-secondary vk-header-settings-empty">Блоков пока нет.</p>}
      >
        <ul class="vk-header-settings-blocks">
          <For each={vkHomeBlocks()}>
            {(block, index) => (
              <li class="vk-header-settings-block" classList={{'is-hidden': block.kind === 'system' && block.hidden}} data-vk-home-block={block.id}>
                <span class="vk-header-settings-block-icon" aria-hidden="true">
                  <VKIcon name={iconOf(block)} size={18} />
                </span>
                <span class="vk-header-settings-block-info">
                  <span class="vk-header-settings-block-title">{titleOf(block)}</span>
                  <span class="vk-page-text-secondary">{detailOf(block)}</span>
                </span>
                <button
                  type="button"
                  class="vk-header-settings-icon"
                  aria-label={`Поднять выше: ${titleOf(block)}`}
                  title="Выше"
                  disabled={index() === 0}
                  onClick={() => move(block.id, -1)}
                >
                  <VKIcon name="up" size={14} />
                </button>
                <button
                  type="button"
                  class="vk-header-settings-icon vk-header-settings-down"
                  aria-label={`Опустить ниже: ${titleOf(block)}`}
                  title="Ниже"
                  disabled={index() === vkHomeBlocks().length - 1}
                  onClick={() => move(block.id, 1)}
                >
                  <VKIcon name="up" size={14} />
                </button>
                <Show
                  when={block.kind === 'system' && block}
                  fallback={
                    <button
                      type="button"
                      class="vk-header-settings-icon"
                      aria-label={`Удалить блок: ${titleOf(block)}`}
                      title="Удалить"
                      onClick={() => void remove(block.id)}
                    >
                      <VKIcon name="close" size={14} />
                    </button>
                  }
                >
                  {(system) => (
                    <button
                      type="button"
                      class="vk-header-settings-icon"
                      aria-label={`${system().hidden ? 'Показать' : 'Скрыть'} блок: ${titleOf(block)}`}
                      aria-pressed={system().hidden}
                      title={system().hidden ? 'Показать' : 'Скрыть'}
                      onClick={() => void toggleHidden(block.id, !system().hidden)}
                    >
                      <VKIcon name={system().hidden ? 'eye-off' : 'eye'} size={14} />
                    </button>
                  )}
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <div class="vk-home-blocks-legend vk-header-settings-add-legend">Добавить блок</div>
      <div class="vk-header-settings-add">
        <For each={KINDS}>
          {(item) => (
            <button type="button" class="vk-header-settings-add-button" disabled={isFull()} onClick={() => add(item.kind)}>
              <VKIcon name={item.icon} size={14} />
              {item.title}
            </button>
          )}
        </For>
      </div>
      <Show when={isFull()}>
        <p class="vk-home-blocks-note">Своих блоков можно добавить не больше {VK_HOME_MAX_BLOCKS}.</p>
      </Show>

      {/* only how the block «Информация о пользователе» of my page looks; the data itself stays */}
      <div class="vk-home-blocks-legend vk-header-settings-add-legend">Информация о пользователе</div>
      <fieldset class="vk-home-blocks-options">
        <Choice type="checkbox" checked={vkHomeHidePhone()} onChange={(checked) => setVKHomeInfoHidden('hidePhone', checked)}>
          Скрыть номер телефона
        </Choice>
        <Choice type="checkbox" checked={vkHomeHideUsername()} onChange={(checked) => setVKHomeInfoHidden('hideUsername', checked)}>
          Скрыть никнейм
        </Choice>
      </fieldset>
      <p class="vk-home-blocks-hint">Меняется только вид блока на вашей странице.</p>
    </div>
  );
}

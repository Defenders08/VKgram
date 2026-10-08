import {For} from 'solid-js';
import type {Message} from '@layer';
import {copyTextToClipboard} from '@helpers/clipboard';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import rootScope from '@lib/rootScope';
import {toast} from '@components/toast';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import VKReactionGlyph, {isPickableReaction} from '@/vkgram/components/VKReactionGlyph';
import {canForwardPost, openForwardPopup} from '@/vkgram/pages/channel/forwardPost';
import {openVKPostMenu, VKPostMenuItem} from '@/vkgram/pages/channel/VKPostMenu';
import {isPostSelected, isSelecting as isSelectionActive, startPostSelection, togglePostSelection} from '@/vkgram/pages/channel/postSelection';
import {openVKReport} from '@/vkgram/components/VKReportModal';

// parts of a post that keep the browser's own menu (links, the comment form) or have their own
const NATIVE_MENU_SELECTOR = 'a[href], input, textarea, [contenteditable="true"], .vk-comments';

// a long press of a finger (a touch event on Apple, a `contextmenu` from a touch elsewhere), not a mouse
const isTouchPress = (e: MouseEvent | TouchEvent) => e.type.startsWith('touch') ||
  (e as PointerEvent).pointerType === 'touch' || (e as PointerEvent).pointerType === 'pen';

/**
 * The menu of one publication: VKgram's own card (`VKPostMenu`) — quick
 * reactions on top, then the actions, in the project's look and in the day and
 * the night theme.
 *
 * Desktop: a right click on the post opens it where the cursor is; the ⋮ next
 * to the author opens the same menu under the button. A finger opens it with
 * the ⋮ only (a long press stays the browser's — text selection, scrolling);
 * a mouse on a touch laptop still has the right click. On a phone it is a sheet.
 *
 * The actions are Web K's: the same checks the chat's menu makes (`verify` —
 * an item that cannot be done is not shown) and the same popups / manager
 * calls. «Выделить» starts the selection of posts (`postSelection`).
 */
export default function createPostMenu(options: {
  // the post element: right clicks on it open the menu
  element: HTMLElement,
  // the post's messages (an album has several) and the one carrying its text
  getMessages: () => Message.message[],
  getMain: () => Message.message
}) {
  const managers = rootScope.managers;
  const peerId = () => options.getMain().peerId;
  const mids = () => options.getMessages().map((message) => message.mid);

  const canForward = () => canForwardPost(options.getMessages());

  // the pin state as Web K's storage has it now (the post's own copy is not updated by a pin)
  const isPinned = async() => {
    const main = options.getMain();
    const message = await managers.appMessagesManager.getMessageByPeer(main.peerId, main.mid);
    return !!((message as Message.message) ?? main).pFlags?.pinned;
  };

  const isMuted = () => managers.appNotificationsManager.isPeerLocalMuted({peerId: peerId(), respectType: true});

  // the same link the chat's «Копировать ссылку» makes: t.me/<username>/<id>, or t.me/c/<id>/<id> for a private channel
  const getLink = async() => {
    const main = options.getMain();
    const username = await managers.appPeersManager.getPeerUsername(main.peerId);
    const id = getServerMessageId(main.mid);
    return {
      url: username ? `https://t.me/${username}/${id}` : `https://t.me/c/${main.peerId.toChatId()}/${id}`,
      isPrivate: !username
    };
  };

  type Action = VKPostMenuItem & {verify?: () => boolean | Promise<boolean>};

  const actions: Action[] = [
    {
      icon: 'reply',
      title: 'Ответить',
      onClick: () => openVKChat(peerId(), {mid: options.getMain().mid, kind: 'reply'})
    }, {
      icon: 'select',
      get title() {
        return isPostSelected(options.getMessages()) ? 'Снять выделение' : 'Выделить';
      },
      onClick: () => {
        if(isSelectionActive()) togglePostSelection(options.getMessages());
        else startPostSelection(options.getMessages());
      }
    }, {
      icon: 'edit',
      title: 'Редактировать',
      onClick: () => openVKChat(peerId(), {mid: options.getMain().mid, kind: 'edit'}),
      verify: () => managers.appMessagesManager.canEditMessage(options.getMain(), 'text')
    }, {
      icon: 'pin',
      title: 'Закрепить',
      onClick: async() => {
        const {default: showPinMessagePopup} = await import('@components/popups/unpinMessage');
        showPinMessagePopup(peerId(), options.getMain().mid);
      },
      verify: async() => !(await isPinned()) && await managers.appPeersManager.canPinMessage(peerId())
    }, {
      icon: 'pin',
      title: 'Открепить',
      onClick: async() => {
        const {default: showPinMessagePopup} = await import('@components/popups/unpinMessage');
        showPinMessagePopup(peerId(), options.getMain().mid, true);
      },
      verify: async() => await isPinned() && await managers.appPeersManager.canPinMessage(peerId())
    }, {
      icon: 'forward',
      title: 'Переслать',
      onClick: () => openForwardPopup(options.getMessages()),
      verify: canForward
    }, {
      icon: 'bookmark',
      title: 'Сохранить в «Избранное»',
      onClick: async() => {
        try {
          await managers.appMessagesManager.forwardMessages({peerId: rootScope.myId, fromPeerId: peerId(), mids: mids()});
          toast('Публикация сохранена в «Избранном»');
        } catch(err) {
          console.error('VKgram: failed to save the post', err);
          toast('Не удалось сохранить публикацию');
        }
      },
      verify: canForward
    }, {
      icon: 'link',
      title: 'Копировать ссылку',
      onClick: async() => {
        const {url, isPrivate} = await getLink();
        copyTextToClipboard(url);
        toast(isPrivate ? 'Ссылка скопирована. Она откроется только у подписчиков канала.' : 'Ссылка скопирована');
      },
      verify: () => managers.appPeersManager.isChannel(peerId())
    }, {
      icon: 'copy',
      title: 'Копировать текст',
      onClick: () => {
        copyTextToClipboard(options.getMain().message);
        toast('Текст скопирован');
      },
      verify: () => !!options.getMain().message
    }, {
      icon: 'telegram',
      title: 'Открыть в «Телеграм»',
      onClick: () => openVKChat(peerId())
    }, {
      icon: 'bell-off',
      title: 'Отключить уведомления',
      separator: true,
      onClick: () => managers.appMessagesManager.togglePeerMute({peerId: peerId(), mute: true}),
      verify: async() => (await isMuted()) === false
    }, {
      icon: 'bell',
      title: 'Включить уведомления',
      separator: true,
      onClick: () => managers.appMessagesManager.togglePeerMute({peerId: peerId(), mute: false}),
      verify: async() => (await isMuted()) === true
    }, {
      icon: 'flag',
      title: 'Пожаловаться',
      onClick: () => {
        openVKReport(peerId(), mids());
      },
      verify: async() => !options.getMain().pFlags.out && await managers.appPeersManager.isChannel(peerId())
    }, {
      icon: 'trash',
      danger: true,
      title: 'Удалить',
      onClick: async() => {
        const [{default: showDeleteMessagesPopup}, {ChatType}] = await Promise.all([
          import('@components/popups/deleteMessages'),
          import('@components/chat/chatType')
        ]);
        showDeleteMessagesPopup(peerId(), mids(), ChatType.Chat);
      },
      verify: () => managers.appMessagesManager.canDeleteMessage(options.getMain())
    }
  ];

  // the quick reactions of the post (the ones Web K allows on it)
  const loadReactions = async() => {
    try {
      const res = await managers.appReactionsManager.getAvailableReactionsByMessage(options.getMain());
      return res.reactions.filter(isPickableReaction).slice(0, 6);
    } catch(err) {
      return [];
    }
  };

  let closeMenu: (() => void) | undefined;
  // A press on the ⋮ of an open menu first closes it (any press outside closes the menu);
  // the click that follows must not open it again at once — the ⋮ toggles.
  let closedAt = 0;
  // a menu is being prepared (the checks are async): a second open waits for it
  let isOpening = false;

  const open = async(anchor: {x: number, y: number, align: 'cursor' | 'right'}) => {
    if(isOpening) return;
    isOpening = true;
    try {
      closeMenu?.();
      const [checks, reactions] = await Promise.all([
        Promise.all(actions.map(async({verify}) => {
          try {
            return verify ? await verify() : true;
          } catch(err) {
            return false;
          }
        })),
        loadReactions()
      ]);

      // «Снять выделение» / «Выделить» is read when the menu opens
      const items = actions.filter((_, index) => checks[index]).map(({verify, ...item}) => item);
      // a separator belongs to the first item of its group: none is left hanging at the top
      if(items[0]) items[0].separator = false;

      options.element.classList.add('menu-open');
      closeMenu = openVKPostMenu({
        anchor,
        items,
        header: reactions.length ? () => (
          <div class="vk-post-menu-reactions">
            <For each={reactions}>
              {(reaction) => (
                <button
                  type="button"
                  class="vk-reaction-quick-btn"
                  onClick={() => {
                    managers.appReactionsManager.sendReaction({message: options.getMain(), reaction});
                    closeMenu?.();
                  }}
                >
                  <VKReactionGlyph reaction={reaction} size={20} />
                </button>
              )}
            </For>
          </div>
        ) : undefined,
        onClose: () => {
          closeMenu = undefined;
          closedAt = Date.now();
          options.element.classList.remove('menu-open');
        }
      });
    } finally {
      isOpening = false;
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    if(isTouchPress(e)) return;
    if((e.target as HTMLElement | null)?.closest?.(NATIVE_MENU_SELECTOR)) return;
    e.preventDefault();
    open({x: e.clientX, y: e.clientY, align: 'cursor'});
  };
  options.element.addEventListener('contextmenu', onContextMenu);

  return {
    /** The ⋮ button: the menu drops from under it, aligned to its right edge */
    openFromButton: (button: HTMLElement) => {
      if(Date.now() - closedAt < 300) return;
      const rect = button.getBoundingClientRect();
      open({x: rect.right, y: rect.bottom + 2, align: 'right'});
    },
    destroy: () => {
      options.element.removeEventListener('contextmenu', onContextMenu);
      closeMenu?.();
    }
  };
}

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import type {Message, ReactionCount} from '@layer';
import VKChannelPostReactions from '@/vkgram/pages/channel/VKChannelPostReactions';

const mocks = vi.hoisted(() => ({
  sendReaction: vi.fn(),
  getAvailableReactionsByMessage: vi.fn(async() => ({reactions: []})),
  getMessageReactionsList: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appReactionsManager: {
        sendReaction: mocks.sendReaction,
        getAvailableReactionsByMessage: mocks.getAvailableReactionsByMessage,
        getMessageReactionsList: mocks.getMessageReactionsList
      }
    },
    addEventListener: mocks.addEventListener,
    removeEventListener: mocks.removeEventListener
  }
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => ({})
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

vi.mock('@components/toast', () => ({
  toast: vi.fn()
}));

vi.mock('@/vkgram/components/VKReactionGlyph', () => ({
  // the real component mounts Web K's custom emoji renderer: a plain emoticon is enough here
  default: (props: {reaction: {emoticon?: string}}) => <span>{props.reaction.emoticon ?? '✦'}</span>,
  isPickableReaction: (reaction: {_: string}) => reaction._ === 'reactionEmoji' || reaction._ === 'reactionCustomEmoji'
}));

const emojiReaction = (emoticon: string) => ({_: 'reactionEmoji', emoticon}) as any;

const reactionCount = (emoticon: string, count: number, chosenOrder?: number) => ({
  _: 'reactionCount',
  reaction: emojiReaction(emoticon),
  count,
  ...(chosenOrder === undefined ? {} : {chosen_order: chosenOrder}),
  pFlags: {}
}) as ReactionCount;

const makeMessage = (results: ReactionCount[], canSeeList = false) => ({
  _: 'message',
  mid: 1,
  peerId: '-100123',
  date: 1000,
  message: 'post',
  reactions: {
    _: 'messageReactions',
    results,
    pFlags: {can_see_list: canSeeList}
  }
}) as unknown as Message.message;

const chips = () => [...document.querySelectorAll<HTMLButtonElement>('.vk-reactions-scroll > .vk-reaction:not(.vk-reaction-more)')];
const moreButton = () => document.querySelector<HTMLButtonElement>('.vk-reaction-more');

describe('VKChannelPostReactions', () => {
  let dispose: () => void;

  beforeEach(() => {
    document.body.replaceChildren();
    mocks.sendReaction.mockReset();
    mocks.getAvailableReactionsByMessage.mockClear().mockResolvedValue({reactions: []});
    mocks.getMessageReactionsList.mockReset();
  });

  afterEach(() => {
    dispose?.();
    document.body.replaceChildren();
  });

  const mount = (message: Message.message) => {
    dispose = render(() => <VKChannelPostReactions message={message} />, document.body);
  };

  it('marks my own reaction with is-chosen and aria-pressed', () => {
    mount(makeMessage([
      reactionCount('👍', 3),
      reactionCount('😢', 1, 0)
    ]));

    const [first, second] = chips();
    expect(first.classList.contains('is-chosen')).toBe(false);
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.classList.contains('is-chosen')).toBe(true);
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });

  it('adds a reaction by clicking its chip', async() => {
    const message = makeMessage([reactionCount('👍', 3)]);
    mount(message);

    chips()[0].click();
    await vi.waitFor(() => expect(mocks.sendReaction).toHaveBeenCalledTimes(1));
    expect(mocks.sendReaction).toHaveBeenCalledWith({message, reaction: emojiReaction('👍')});
  });

  it('removes my reaction by clicking my chip again', async() => {
    // the manager answers with the reactions left after the removal, and the row follows
    const message = makeMessage([reactionCount('👍', 1, 0)]);
    mocks.sendReaction.mockResolvedValue({_: 'messageReactions', results: [], pFlags: {}});
    mount(message);

    expect(chips()[0].classList.contains('is-chosen')).toBe(true);
    chips()[0].click();

    await vi.waitFor(() => expect(document.querySelector('.vk-reactions')).toBeNull());
    expect(mocks.sendReaction).toHaveBeenCalledWith({message, reaction: emojiReaction('👍')});
  });

  it('switches to another reaction through the picker', async() => {
    const message = makeMessage([reactionCount('👍', 2, 0)]);
    mocks.getAvailableReactionsByMessage.mockResolvedValue({
      reactions: [emojiReaction('👍'), emojiReaction('🔥'), emojiReaction('😢')]
    });
    // the manager's answer: my 👍 became 🔥
    mocks.sendReaction.mockResolvedValue({
      _: 'messageReactions',
      results: [reactionCount('👍', 1), reactionCount('🔥', 1, 0)],
      pFlags: {}
    });
    mount(message);

    const add = await vi.waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>('.vk-reaction-add');
      expect(el).toBeTruthy();
      return el!;
    });
    add.click();

    const pickerItems = await vi.waitFor(() => {
      const items = [...document.querySelectorAll<HTMLButtonElement>('.vk-reaction-picker-item')];
      expect(items.length).toBe(3);
      return items;
    });
    pickerItems[1].click();

    await vi.waitFor(() => expect(mocks.sendReaction).toHaveBeenCalledTimes(1));
    expect(mocks.sendReaction).toHaveBeenCalledWith({message, reaction: emojiReaction('🔥')});

    // the row follows the answer: 🔥 is mine now, 👍 is not
    await vi.waitFor(() => {
      const chipsNow = chips();
      expect(chipsNow.length).toBe(2);
      expect(chipsNow[1].classList.contains('is-chosen')).toBe(true);
      expect(chipsNow[0].classList.contains('is-chosen')).toBe(false);
    });
  });

  it('collapses a long row behind «+N» and keeps my reaction visible', () => {
    mount(makeMessage([
      reactionCount('👍', 10),
      reactionCount('😢', 9),
      reactionCount('🔥', 8),
      reactionCount('🥰', 7),
      reactionCount('🤔', 6),
      reactionCount('😱', 5),
      reactionCount('🎉', 4),
      reactionCount('🤯', 3),
      reactionCount('xxx', 2),
      reactionCount('😢', 2),
      reactionCount('🗿', 2, 0),
      reactionCount('💯', 1)
    ]));

    const visible = chips();
    // 8 chips fit: the first 7 and mine (🗿 would otherwise hide behind «+N»)
    expect(visible.length).toBe(8);
    expect(visible[visible.length - 1].classList.contains('is-chosen')).toBe(true);
    expect(moreButton()!.textContent).toBe('+4');
    expect(moreButton()!.getAttribute('aria-expanded')).toBe('false');

    moreButton()!.click();
    expect(chips().length).toBe(12);
    expect(moreButton()!.getAttribute('aria-expanded')).toBe('true');

    moreButton()!.click();
    expect(chips().length).toBe(8);
  });

  it('renders nothing when the post has no reactions and none are allowed', () => {
    mount(makeMessage([]));
    expect(document.querySelector('.vk-channel-post-reactions')).toBeNull();
  });
});

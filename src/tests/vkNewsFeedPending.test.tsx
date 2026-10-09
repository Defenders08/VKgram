import {afterEach, describe, expect, it, vi} from 'vitest';
import {createRoot, createSignal} from 'solid-js';
import type {Message} from '@layer';
import createNewsFeed, {VKNewsRules} from '@/vkgram/hooks/createNewsFeed';

// the fake histories of the channels, keyed by peerId as a string: created as
// the feed reads a channel, owned by the test from then on
const histories = vi.hoisted(() => new Map<string, {push: (message: any) => void, setAll: (messages: any[]) => void}>());

vi.mock('@/vkgram/pages/channel/createChannelHistory', async() => {
  const {createSignal} = await import('solid-js');
  return {
    default: (options: {peerId: () => PeerId}) => {
      const [messages, setMessages] = createSignal<any[]>([], {equals: false});
      histories.set(String(options.peerId()), {
        push: (message) => setMessages((list) => [...list, message]),
        setAll: (list) => setMessages(list)
      });
      return {
        messages,
        status: () => 'loaded' as const,
        isLoadingMore: () => false,
        isEnd: () => true,
        loadMore: () => {},
        reload: () => {}
      };
    }
  };
});

// no channel is muted, and the answer is known at once
vi.mock('@/vkgram/hooks/createMutedPeers', () => ({
  default: () => ({isMuted: () => false, isResolved: () => true})
}));

// the fake dialogs say their date themselves
vi.mock('@/vkgram/utils/getDialogLastMessage', () => ({
  default: (dialog: any) => dialog.lastMessage
}));

const A = '1001' as unknown as PeerId;
const B = '1002' as unknown as PeerId;
const C = '1003' as unknown as PeerId;

const message = (peerId: PeerId, mid: number, date: number) =>
  ({_: 'message' as const, peerId, mid, date} as Message.message);

type FakeDialog = {peerId: PeerId, folder_id?: number, lastMessage: {date: number}};

const dialog = (peerId: PeerId, date: number): FakeDialog => ({peerId, lastMessage: {date}});

let disposeRoot: () => void;
afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
  histories.clear();
});

const build = (dialogs: FakeDialog[], rules?: () => VKNewsRules) => {
  const [list, setDialogs] = createSignal(dialogs);
  let feed!: ReturnType<typeof createNewsFeed>;
  disposeRoot = createRoot((dispose) => {
    feed = createNewsFeed({
      source: {channels: list, isReady: () => true, notifyVersion: () => 0} as any,
      rules: rules ?? (() => ({hideArchived: false, hideMuted: false}))
    });
    return dispose;
  });
  return {feed, setDialogs};
};

describe('createNewsFeed — live posts wait behind the «Новые посты» button', () => {
  it('holds a post that arrives live and shows it on release', () => {
    const {feed} = build([dialog(A, 100), dialog(B, 99)]);
    histories.get(String(A))!.setAll([message(A, 1, 100), message(A, 2, 97)]);
    histories.get(String(B))!.setAll([message(B, 1, 99)]);
    expect(feed.postKeys()).toHaveLength(3);
    expect(feed.pendingCount()).toBe(0);

    // the posts on the screen keep their objects: the block above the button
    // must not rebuild itself while a post waits
    const before = feed.getPost(`${A}_1`);

    histories.get(String(A))!.push(message(A, 5, 200));
    // the list did not move; the button knows
    expect(feed.postKeys()).toHaveLength(3);
    expect(feed.pendingCount()).toBe(1);
    expect(feed.getPost(`${A}_1`)).toBe(before);

    feed.releasePending();
    expect(feed.pendingCount()).toBe(0);
    expect(feed.postKeys()).toHaveLength(4);
    // newest first again
    expect(feed.postKeys()[0]).toBe(`${A}_5`);
    // and the screen's posts are still the same objects
    expect(feed.getPost(`${A}_1`)).toBe(before);
  });

  it('what a channel loads at its start is not held, even when it loads late', () => {
    const {feed} = build([dialog(A, 100), dialog(B, 99)]);
    histories.get(String(A))!.setAll([message(A, 1, 100)]);
    // B's first page comes after A's: it shows at once, nothing waits
    histories.get(String(B))!.setAll([message(B, 4, 150)]);
    expect(feed.pendingCount()).toBe(0);
    expect(feed.postKeys()).toHaveLength(2);
    expect(feed.postKeys()[0]).toBe(`${B}_4`);
  });

  it('an edit of a known post is not a new one', () => {
    const {feed} = build([dialog(A, 100)]);
    histories.get(String(A))!.setAll([message(A, 1, 100)]);
    // a new object for the same message (views, reactions, the text changed)
    histories.get(String(A))!.setAll([{...message(A, 1, 100), views: 5}]);
    expect(feed.pendingCount()).toBe(0);
  });

  it('an edit of a post on the screen rebuilds that post only', () => {
    const {feed} = build([dialog(A, 100), dialog(B, 99)]);
    histories.get(String(A))!.setAll([message(A, 1, 100)]);
    histories.get(String(B))!.setAll([message(B, 1, 99)]);
    const a = feed.getPost(`${A}_1`);
    const b = feed.getPost(`${B}_1`);

    histories.get(String(A))!.setAll([{...message(A, 1, 100), views: 5}]);
    expect(feed.getPost(`${A}_1`)).not.toBe(a);
    expect(feed.getPost(`${B}_1`)).toBe(b);
  });

  it('a held post that is deleted stops waiting', () => {
    const {feed} = build([dialog(A, 100)]);
    histories.get(String(A))!.setAll([message(A, 1, 100)]);
    histories.get(String(A))!.push(message(A, 5, 200));
    expect(feed.pendingCount()).toBe(1);

    // the post is gone: nothing is waiting any more
    histories.get(String(A))!.setAll([message(A, 1, 100)]);
    expect(feed.pendingCount()).toBe(0);

    // a later live post still waits and shows
    histories.get(String(A))!.push(message(A, 6, 210));
    expect(feed.pendingCount()).toBe(1);
    feed.releasePending();
    expect(feed.postKeys()[0]).toBe(`${A}_6`);
    expect(feed.postKeys()).toHaveLength(2);
  });

  it('another feed (a rule change) starts fresh: its own posts show at once, what comes after waits', () => {
    const [rules, setRules] = createSignal<VKNewsRules>({hideArchived: false, hideMuted: false});
    const {feed} = build([dialog(A, 100), dialog(B, 99)], rules);
    histories.get(String(A))!.setAll([message(A, 1, 100)]);
    histories.get(String(A))!.push(message(A, 5, 200));
    expect(feed.pendingCount()).toBe(1);

    // a folder's feed: only B
    setRules({peerIds: new Set([B]), hideArchived: false, hideMuted: false});
    expect(feed.pendingCount()).toBe(0);

    // B's own posts show at once…
    histories.get(String(B))!.setAll([message(B, 1, 90)]);
    expect(feed.pendingCount()).toBe(0);
    expect(feed.postKeys()).toHaveLength(1);

    // …and what arrives in it after that waits
    histories.get(String(B))!.push(message(B, 7, 180));
    expect(feed.pendingCount()).toBe(1);
    expect(feed.postKeys()).toHaveLength(1);
  });

  it('a live post in a channel the feed has not read does not blank the screen', () => {
    // fifteen posts of A fill the feed on their own
    const fifteen = Array.from({length: 15}, (_, index) => message(A, 15 - index, 100 - index));
    const {feed, setDialogs} = build([dialog(A, 100), dialog(C, 90)]);
    histories.get(String(A))!.setAll(fifteen);
    expect(feed.postKeys()).toHaveLength(15);
    expect(feed.isLoading()).toBe(false);
    const keys = feed.postKeys();

    // a live post arrives in C: its dialog's top message jumps up
    setDialogs([dialog(A, 100), dialog(C, 200)]);
    // the screen stays: the frontier does not hide the posts it is showing
    expect(feed.isLoading()).toBe(false);
    expect(feed.postKeys()).toEqual(keys);

    // the post itself lands behind the button: the arrival promised it
    histories.get(String(C))!.push(message(C, 1, 200));
    expect(feed.pendingCount()).toBe(1);
    expect(feed.postKeys()).toEqual(keys);

    feed.releasePending();
    // the window is the limit wide: the released post stands first, the oldest
    // one steps out of it (and comes back as the feed loads further)
    expect(feed.postKeys()[0]).toBe(`${C}_1`);
    expect(feed.postKeys()).toHaveLength(15);
    expect(feed.pendingCount()).toBe(0);
  });
});

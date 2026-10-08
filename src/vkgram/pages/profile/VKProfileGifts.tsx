import {createEffect, createSignal, For, onCleanup, Show} from 'solid-js';
import type {MyStarGift} from '@lib/appManagers/appGiftsManager';
import rootScope from '@lib/rootScope';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {AvatarNewTsx} from '@components/avatarNew';
import VKIcon from '@/vkgram/components/VKIcons';
import VKGiftSticker, {createGiftStickerRenderer} from '@/vkgram/components/VKGiftSticker';
import {VKGiftsPrivacyModal} from '@/vkgram/pages/settings/VKGiftsPrivacy';
import VKGiftReceivedModal from '@/vkgram/pages/profile/VKGiftReceivedModal';

const PAGE = 12;
const STICKER = 80;

// the colors of a unique gift's backdrop are 24-bit numbers
const hex = (value: number | undefined) => '#' + ((value ?? 0) & 0xffffff).toString(16).padStart(6, '0');

function GiftStar() {
  return (
    <svg class="vk-gift-star-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 16.9l-5.7 3.1 1.2-6.3L2.8 9.3l6.4-.8L12 2.6z" />
    </svg>
  );
}

/**
 * One gift of the profile: a tile of the page's own look. A regular gift stands on a white tile with
 * its price; a collectible one on its own backdrop with its title and number. A pin marks the gifts
 * the owner keeps on top, the square avatar at the left of the foot is the sender (when they did not hide the name).
 */
function GiftCard(props: {
  gift: MyStarGift,
  renderer: ReturnType<typeof createGiftStickerRenderer>,
  onOpen: (gift: MyStarGift) => void
}) {
  const raw = props.gift.raw as any;
  const saved = props.gift.saved;
  const isUnique = raw._ === 'starGiftUnique';
  const backdrop = isUnique ? (raw.attributes ?? []).find((item: any) => item._ === 'starGiftAttributeBackdrop') : undefined;
  const isPinned = !!saved?.pFlags?.pinned_to_top;
  const fromId = saved?.from_id && !saved.pFlags?.name_hidden ? getPeerId(saved.from_id) : undefined;
  const label = isUnique ? `${raw.title} #${raw.num ?? 0}` : `${raw.stars} ★`;

  return (
    <button
      type="button"
      class="vk-gift-card"
      classList={{'is-unique': isUnique}}
      style={backdrop ? {
        '--vk-gift-center': hex(backdrop.center_color),
        '--vk-gift-edge': hex(backdrop.edge_color),
        '--vk-gift-text': hex(backdrop.text_color ?? 0xffffff)
      } : undefined}
      title={label}
      aria-label={label}
      onClick={() => props.onOpen(props.gift)}
    >
      <Show when={isPinned}>
        <span class="vk-gift-card-pin" aria-hidden="true"><VKIcon name="pin" size={12} /></span>
      </Show>
      <VKGiftSticker doc={props.gift.sticker} renderer={props.renderer} size={STICKER} />
      <span class="vk-gift-card-foot">
        <Show when={fromId !== undefined}>
          <span class="vk-gift-card-from"><AvatarNewTsx peerId={fromId} size={24} /></span>
        </Show>
        <span class="vk-gift-card-caption">
          <Show when={isUnique} fallback={<span class="vk-gift-card-price"><GiftStar /> {raw.stars}</span>}>
            <span class="vk-gift-card-title">{raw.title}</span>
            <span class="vk-gift-card-num">#{raw.num ?? 0}</span>
          </Show>
        </span>
      </span>
    </button>
  );
}

/**
 * «Подарки» of «Моя страница». Data: appGiftsManager.getProfileGifts (the
 * gifts shown on the profile, with the server's own paging). Rendering: a
 * row of `GiftCard` tiles; a click opens the VKgram gift window. Managing
 * gifts (pin, transfer, collections) stays in Web K's profile for now.
 */
export default function VKProfileGifts(props: {
  // kept for the callers; the tiles are plain markup now and need no scroll root
  scrollParent?: HTMLElement,
  // whose gifts; mine when omitted (a channel page passes the channel)
  peerId?: PeerId,
  // draw nothing when the peer has no gifts or they can't be read
  hideWhenEmpty?: boolean,
  // the id of the block in the page's blocks («Настройки» of the top bar)
  blockId?: string
}) {
  const peerId = () => props.peerId ?? rootScope.myId;
  const isMine = () => peerId() === rootScope.myId;
  const [gifts, setGifts] = createSignal<MyStarGift[]>();
  const [count, setCount] = createSignal(0);
  const [next, setNext] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);

  const loadPage = async() => {
    if(loading()) return;
    setLoading(true);
    try {
      const result = await rootScope.managers.appGiftsManager.getProfileGifts({
        peerId: peerId(),
        offset: next(),
        limit: PAGE
      });
      setGifts((gifts() ?? []).concat(result.gifts));
      setCount(result.count);
      setNext(result.next || undefined);
    } catch(err) {
      console.error('VKgram: getProfileGifts failed', err);
      setGifts((gifts) => gifts ?? []);
    } finally {
      setLoading(false);
    }
  };
  loadPage();

  // every gift, collectible ones too, opens the native VKgram window; the tools of a collectible
  // (upgrade, resale, transfer) are one link away, in Web K's own window
  const [infoGift, setInfoGift] = createSignal<MyStarGift>();
  const [isPrivacyOpen, setPrivacyOpen] = createSignal(false);

  const openInfo = (gift: MyStarGift) => setInfoGift(gift);

  // one renderer for all the tiles; it is destroyed with the block
  const renderer = createGiftStickerRenderer(STICKER, false);
  const rest = () => Math.max(0, count() - (gifts()?.length ?? 0));

  // the last tile of the row loads the next page by itself when the row's end comes into view (or is
  // in view at once, when the row is short): it is watched inside the row, which is the scroll box.
  // Every new page sets the watching anew, so a row that is still not full asks for one more. A page
  // that failed does not loop — the tile stays a button for a second try.
  const [moreTile, setMoreTile] = createSignal<HTMLButtonElement>();
  createEffect(() => {
    const tile = moreTile();
    gifts();
    if(!tile) return;
    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting) && !loading()) loadPage();
    }, {root: tile.closest('ul'), rootMargin: '0px 240px 0px 0px'});
    observer.observe(tile);
    onCleanup(() => observer.disconnect());
  });

  return (
    <>
      <Show when={!props.hideWhenEmpty || gifts()?.length}>
      <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-gifts-title" data-vk-home-block={props.blockId}>
        <h2 id="vk-profile-gifts-title" class="vk-block-title">
          Подарки
          <Show when={count()}>
            <span class="vk-page-text-secondary"> {count()}</span>
          </Show>
        </h2>
        <Show when={gifts()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
          <Show when={gifts().length} fallback={<p class="vk-page-text vk-page-text-secondary">Подарков пока нет.</p>}>
            <ul class="vk-gift-list">
              <For each={gifts()}>
                {(gift) => (
                  <li>
                    <GiftCard gift={gift} renderer={renderer} onOpen={openInfo} />
                  </li>
                )}
              </For>
              {/* the rest of the gifts: the last tile of the row; it loads the next page when it is reached */}
              <Show when={next()}>
                <li>
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
                        {rest() ? `+${rest()}` : '…'}
                      </Show>
                    </span>
                    <span class="vk-story-more-label">{loading() ? 'Загрузка…' : 'Показать ещё'}</span>
                  </button>
                </li>
              </Show>
            </ul>
          </Show>
          <Show when={isMine()}>
            <div class="vk-profile-actions vk-gift-actions">
              <button
                type="button"
                class="vk-link-button"
                onClick={() => setPrivacyOpen(true)}
              >
                Настройки подарков
              </button>
            </div>
          </Show>
          </Show>
        </section>
      </Show>
      <Show when={infoGift()} keyed>
        {(gift) => <VKGiftReceivedModal gift={gift} onClose={() => setInfoGift(undefined)} />}
      </Show>
      <Show when={isPrivacyOpen()}>
        <VKGiftsPrivacyModal onClose={() => setPrivacyOpen(false)} />
      </Show>
    </>
  );
}

import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import type {MyStarGift} from '@lib/appManagers/appGiftsManager';
import type {User, Chat} from '@layer';
import rootScope from '@lib/rootScope';
import {NULL_PEER_ID} from '@appManagers/constants';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {usePeers} from '@stores/peers';
import {formatFullSentTime} from '@helpers/date';
import wrapRichText from '@richTextProcessor/wrapRichText';
import {getMiddleware} from '@helpers/middleware';
import LazyLoadQueue from '@components/lazyLoadQueue';
import SuperStickerRenderer from '@components/emoticonsDropdown/tabs/SuperStickerRenderer';
import VKModal from '@/vkgram/components/VKModal';
import {openVKGiftShop} from '@/vkgram/components/VKGiftShopModal';

type AnyPeer = User.user | Exclude<Chat, Chat.chatEmpty>;

/**
 * The stars currency glyph: a flat golden star, drawn here so the gift window
 * does not pull Web K's whole stars-popup module into the boot graph just for
 * an icon.
 */
function GiftStar(props: {size?: number}) {
  return (
    <svg
      class="vk-gift-star-icon"
      width={props.size ?? 14}
      height={props.size ?? 14}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 16.9l-5.7 3.1 1.2-6.3L2.8 9.3l6.4-.8L12 2.6z" />
    </svg>
  );
}

const peerTitle = (peer: AnyPeer | undefined) => {
  if(!peer) return undefined;
  if(peer._ === 'user') {
    return [peer.first_name, peer.last_name].filter(Boolean).join(' ') || peer.username || undefined;
  }
  return peer.title;
};

// the colors of a unique gift's backdrop are 24-bit numbers
const hex = (value: number | undefined) => '#' + ((value ?? 0) & 0xffffff).toString(16).padStart(6, '0');
// the rarity is told in permille; newer layers keep it in an object of its own
const rarity = (attribute: any) => {
  const permille = attribute?.rarity_permille ?? attribute?.rarity?.permille;
  return permille === undefined ? undefined : (permille / 10).toLocaleString('ru', {maximumFractionDigits: 1}) + '%';
};

/**
 * «Полученный подарок» in a `VKModal` — the standard-gift view of Web K's
 * `starGiftInfo` popup in the VKgram window language: the gift's sticker, its
 * value, the From / Date / Value rows, the sender's message and the profile
 * visibility line with its «Скрыть / Показать» action
 * (`appGiftsManager.toggleGiftHidden`, the same API call). A unique
 * (collectible) gift gets the same window with its backdrop band, number and
 * attributes; its upgrade, resale and transfer stay in Web K's own popup, one
 * link away.
 */
export default function VKGiftReceivedModal(props: {gift: MyStarGift, onClose: () => void}) {
  const myGift = props.gift;
  const saved = myGift.saved;
  const peers = usePeers();
  const raw = myGift.raw as any;
  // a unique (collectible) gift has a number, attributes and an owner instead of a price
  const isUnique = raw._ === 'starGiftUnique';
  const attribute = (type: string) => (raw.attributes ?? []).find((item: any) => item._ === type);
  const model = attribute('starGiftAttributeModel');
  const backdrop = attribute('starGiftAttributeBackdrop');
  const pattern = attribute('starGiftAttributePattern');
  const ownerId = isUnique && raw.owner_id ? getPeerId(raw.owner_id) : NULL_PEER_ID;
  const owner = () => peerTitle(peers[ownerId] as AnyPeer | undefined) ?? raw.owner_name;

  const fromId = saved && saved.from_id ? getPeerId(saved.from_id) : NULL_PEER_ID;
  const from = () => peerTitle(peers[fromId] as AnyPeer | undefined);
  const date = saved ? formatFullSentTime(saved.date) : '';

  const [hidden, setHidden] = createSignal(!!saved?.pFlags.unsaved);
  const [toggling, setToggling] = createSignal(false);
  const canToggle = !!(saved && myGift.input && myGift.isIncoming && !myGift.isConverted);

  const toggleHidden = () => {
    if(!myGift.input || toggling()) return;
    setToggling(true);
    rootScope.managers.appGiftsManager.toggleGiftHidden(myGift.input, !hidden())
      .then(() => setHidden(!hidden()))
      .catch((err) => console.error('VKgram: toggleGiftHidden failed', err))
      .finally(() => setToggling(false));
  };

  const sendGiftBack = () => {
    if(fromId === NULL_PEER_ID) return;
    props.onClose();
    openVKGiftShop(fromId);
  };

  // the upgrade, resale and transfer of a collectible are Web K's own tools
  const openClassic = async() => {
    const {default: showStarGiftInfoPopup} = await import('@components/popups/starGiftInfo');
    props.onClose();
    showStarGiftInfoPopup({gift: myGift});
  };

  // the gift's sticker, rendered the way the profile gifts grid renders its own
  let stickerEl!: HTMLDivElement;
  const renderer = new SuperStickerRenderer({
    regularLazyLoadQueue: new LazyLoadQueue(),
    group: 'none',
    managers: rootScope.managers,
    visibleRenderOptions: {loop: false, play: true, width: isUnique ? 110 : 120, height: isUnique ? 110 : 120},
    withLock: false,
    playOnHover: false
  });
  onMount(() => {
    renderer.renderSticker(myGift.sticker, stickerEl);
  });
  onCleanup(() => renderer.destroy());

  const stars = raw.stars;
  const messageText = () => saved?.message ?
    wrapRichText(saved.message.text, {entities: saved.message.entities, middleware: getMiddleware().get()}) :
    undefined;

  return (
    <VKModal title={isUnique ? 'Коллекционный подарок' : 'Полученный подарок'} width={isUnique ? 380 : 360} onClose={props.onClose}>
      <div class="vk-modal-body vk-gift-received" classList={{'is-unique': isUnique}}>
        <Show when={isUnique} fallback={
          <>
            <div class="vk-gift-sticker" ref={stickerEl} />
            <div class="vk-gift-value"><GiftStar size={15} /> {stars}</div>
          </>
        }>
          <div
            class="vk-gift-hero"
            style={{
              '--vk-gift-center': hex(backdrop?.center_color),
              '--vk-gift-edge': hex(backdrop?.edge_color),
              '--vk-gift-text': hex(backdrop?.text_color ?? 0xffffff)
            }}
          >
            <div class="vk-gift-sticker" ref={stickerEl} />
            <div class="vk-gift-hero-title">{raw.title}</div>
            <div class="vk-gift-hero-num">Коллекционный #{(raw.num ?? 0).toLocaleString('ru')}</div>
          </div>
        </Show>

        <dl class="vk-gift-table">
          <Show when={isUnique}>
            <div class="vk-gift-table-row">
              <dt>Владелец</dt>
              <dd>{owner() ?? 'Неизвестно'}</dd>
            </div>
          </Show>
          <Show when={!isUnique || fromId !== NULL_PEER_ID || saved}>
            <div class="vk-gift-table-row">
              <dt>От кого</dt>
              <dd>
                {from() ?? 'Удалённый аккаунт'}
                <Show when={fromId !== NULL_PEER_ID}>
                  {' · '}
                  <button type="button" class="vk-link-button" onClick={sendGiftBack}>Отправить подарок</button>
                </Show>
              </dd>
            </div>
          </Show>
          <Show when={date}>
            <div class="vk-gift-table-row">
              <dt>Дата</dt>
              <dd>{date}</dd>
            </div>
          </Show>
          <Show when={isUnique} fallback={
            <div class="vk-gift-table-row">
              <dt>Стоимость</dt>
              <dd><GiftStar size={14} /> {stars}</dd>
            </div>
          }>
            <Show when={model}>
              <div class="vk-gift-table-row">
                <dt>Модель</dt>
                <dd>{model.name}<Show when={rarity(model)}><span class="vk-gift-tag">{rarity(model)}</span></Show></dd>
              </div>
            </Show>
            <Show when={backdrop}>
              <div class="vk-gift-table-row">
                <dt>Фон</dt>
                <dd>
                  <span class="vk-gift-swatch" style={{background: `linear-gradient(135deg, ${hex(backdrop.center_color)}, ${hex(backdrop.edge_color)})`}} />
                  {backdrop.name}<Show when={rarity(backdrop)}><span class="vk-gift-tag">{rarity(backdrop)}</span></Show>
                </dd>
              </div>
            </Show>
            <Show when={pattern}>
              <div class="vk-gift-table-row">
                <dt>Символ</dt>
                <dd>{pattern.name}<Show when={rarity(pattern)}><span class="vk-gift-tag">{rarity(pattern)}</span></Show></dd>
              </div>
            </Show>
            <Show when={raw.availability_total}>
              <div class="vk-gift-table-row">
                <dt>Выпущено</dt>
                <dd>{(raw.availability_issued ?? 0).toLocaleString('ru')} из {raw.availability_total.toLocaleString('ru')}</dd>
              </div>
            </Show>
          </Show>
        </dl>

        <Show when={messageText()}>
          <div class="vk-gift-message">{messageText()}</div>
        </Show>

        <Show when={canToggle}>
          <p class="vk-gift-note vk-page-text-secondary">
            {hidden() ? 'Подарок скрыт с профиля.' : 'Подарок виден в профиле.'}{' '}
            <button type="button" class="vk-link-button" disabled={toggling()} onClick={toggleHidden}>
              {hidden() ? 'Показать' : 'Скрыть'}
            </button>
          </p>
        </Show>
        <Show when={myGift.isConverted}>
          <p class="vk-gift-note vk-page-text-secondary">Подарок конвертирован в Stars.</p>
        </Show>
        <Show when={isUnique}>
          <p class="vk-gift-note vk-page-text-secondary">
            Улучшение, продажа и передача — в{' '}
            <button type="button" class="vk-link-button" onClick={openClassic}>окне Telegram</button>.
          </p>
        </Show>
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button" onClick={props.onClose}>OK</button>
      </div>
    </VKModal>
  );
}

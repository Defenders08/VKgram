import {createMemo, createResource, createSignal, For, Show} from 'solid-js';
import type {StarGift} from '@layer';
import type {MyStarGift} from '@appManagers/appGiftsManager';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import {toast} from '@components/toast';
import VKModal from '@/vkgram/components/VKModal';
import VKTabs from '@/vkgram/components/VKTabs';
import VKGiftSticker, {createGiftStickerRenderer} from '@/vkgram/components/VKGiftSticker';
import peerTitle from '@/vkgram/utils/peerTitle';
import {apiErrorType, openVKModal} from '@/vkgram/modals';

type Tab = 'all' | 'limited' | 'unlimited';

// a catalog tile: a plain gift with its price (an upgraded one has no `stars` of its own)
type CatalogGift = StarGift.starGift & Pick<MyStarGift, 'sticker'>;
const MESSAGE_MAX = 255;

const Star = (props: {size?: number}) => (
  <svg class="vk-gift-star-icon" width={props.size ?? 12} height={props.size ?? 12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 16.9l-5.7 3.1 1.2-6.3L2.8 9.3l6.4-.8L12 2.6z" />
  </svg>
);

const amountOf = (balance: any): number => {
  if(balance === undefined || balance === null) return 0;
  return Number(typeof balance === 'object' ? balance.amount : balance) || 0;
};

/**
 * «Отправить подарок»: the catalog of Telegram gifts (`appGiftsManager.getStarGiftOptions`) as a
 * grid under the tabs of the project, and a second step for the chosen one — the message, «скрыть
 * моё имя», the price against the person's balance. The purchase is Web K's own payment:
 * `appPaymentsManager.getPaymentForm` with a star-gift invoice, then `sendStarsForm`. When the
 * balance is short, the window says so and hands over to Web K's gift window, which knows how to
 * top the balance up.
 */
export default function VKGiftShopModal(props: {peerId: PeerId, onClose: () => void}) {
  const managers = rootScope.managers;
  const peers = usePeers();
  const recipient = () => peerTitle(peers[props.peerId] as any);

  const renderer = createGiftStickerRenderer(64, false);
  const detailRenderer = createGiftStickerRenderer(96, true);

  // the manager caches the catalog and saves the sticker documents for the wrappers
  const [catalog] = createResource(async() => {
    const options = await managers.appGiftsManager.getStarGiftOptions();
    return options.flatMap((gift): CatalogGift[] => {
      const raw = gift.raw;
      // an upgraded gift and the manager's resale duplicates have no place in the grid, a sold-out one neither
      if(raw._ !== 'starGift' || gift.isResale || raw.pFlags?.sold_out) return [];
      return [{...raw, sticker: gift.sticker}];
    });
  });

  // a fresh balance: the number decides a purchase
  const [balance, {refetch: refetchBalance}] = createResource(async() => {
    const status = await managers.appPaymentsManager.getStarsStatus(true);
    return amountOf((status as any)?.balance);
  });

  const [tab, setTab] = createSignal<Tab>('all');
  const [chosen, setChosen] = createSignal<any>();
  const [message, setMessage] = createSignal('');
  const [hideName, setHideName] = createSignal(false);
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [short, setShort] = createSignal(false);

  const isLimited = (gift: any) => !!gift.pFlags?.limited || gift.availability_total !== undefined;
  const visible = createMemo(() => (catalog() ?? []).filter((gift) =>
    tab() === 'all' || (tab() === 'limited') === isLimited(gift)));

  const choose = (gift: any) => {
    setChosen(gift);
    setError(undefined);
    setShort(false);
  };

  const send = async() => {
    const gift = chosen();
    if(!gift || sending()) return;
    setSending(true);
    setError(undefined);
    setShort(false);
    try {
      const peer = await managers.appPeersManager.getInputPeerById(props.peerId);
      const text = message().trim();
      const invoice: any = {
        _: 'inputInvoiceStarGift',
        pFlags: hideName() ? {hide_name: true} : {},
        peer,
        gift_id: gift.id
      };
      if(text) invoice.message = {_: 'textWithEntities', text, entities: []};

      const form = await managers.appPaymentsManager.getPaymentForm(invoice);
      await managers.appPaymentsManager.sendStarsForm(invoice, form.form_id);

      toast('Подарок отправлен');
      props.onClose();
    } catch(err) {
      console.error('VKgram: sending the gift failed', err);
      const type = apiErrorType(err);
      if(/BALANCE_TOO_LOW/.test(type)) {
        setShort(true);
        refetchBalance();
      } else if(/USER_DISALLOWED_STARGIFTS|DISALLOWED/.test(type)) {
        setError('Получатель не принимает подарки такого типа.');
      } else if(/STARGIFT_USAGE_LIMITED|SOLD_OUT/.test(type)) {
        setError('Этот подарок закончился.');
      } else {
        setError('Не удалось отправить подарок. Попробуйте ещё раз.');
      }
    } finally {
      setSending(false);
    }
  };

  // Web K's own gift window knows how to top the balance up
  const openClassic = async() => {
    const {default: showSendGiftPopup} = await import('@components/popups/sendGift');
    props.onClose();
    showSendGiftPopup({peerId: props.peerId});
  };

  const enough = () => !chosen() || balance() === undefined || balance()! >= chosen().stars;

  return (
    <VKModal title="Отправить подарок" width={460} closeDisabled={sending()} onClose={props.onClose}>
      <Show when={!chosen()} fallback={
        <>
          <div class="vk-modal-body vk-gift-detail">
            <div class="vk-gift-to">
              <AvatarNewTsx peerId={props.peerId} size={32} />
              <div>
                <div class="vk-page-text-secondary">Получатель</div>
                <div class="vk-gift-to-name">{recipient()}</div>
              </div>
            </div>

            <div class="vk-gift-detail-gift">
              <VKGiftSticker doc={chosen().sticker} renderer={detailRenderer} size={96} />
              <div class="vk-gift-value"><Star size={15} /> {chosen().stars}</div>
              <Show when={chosen().availability_remains !== undefined}>
                <div class="vk-page-text-secondary">
                  Осталось {chosen().availability_remains} из {chosen().availability_total}
                </div>
              </Show>
            </div>

            <label class="vk-modal-label" for="vk-gift-message">Сообщение к подарку</label>
            <textarea
              id="vk-gift-message"
              class="vk-textarea"
              rows={3}
              maxLength={MESSAGE_MAX}
              placeholder="Необязательно"
              value={message()}
              onInput={(e) => setMessage(e.currentTarget.value)}
            />
            <p class="vk-settings-caption vk-page-text-secondary">{message().length} / {MESSAGE_MAX}</p>

            <label class="vk-check">
              <input type="checkbox" checked={hideName()} onChange={(e) => setHideName(e.currentTarget.checked)} />
              <span class="vk-check-box" aria-hidden="true" />
              <span class="vk-check-label">Скрыть моё имя</span>
            </label>
            <p class="vk-settings-caption vk-page-text-secondary">
              Подарок можно оставить на странице или конвертировать в Stars.
            </p>

            <p class="vk-gift-balance" classList={{'is-short': !enough()}}>
              Ваш баланс: <Star size={12} /> {balance() ?? '…'}
            </p>

            <Show when={short()}>
              <p class="vk-modal-warning">
                На балансе не хватает звёзд.{' '}
                <button type="button" class="vk-link-button" onClick={openClassic}>Пополнить в Telegram</button>
              </p>
            </Show>
            <Show when={error()}>
              <p class="vk-modal-error" role="alert">{error()}</p>
            </Show>
          </div>
          <div class="vk-modal-foot">
            <button type="button" class="vk-button" disabled={sending()} onClick={send}>
              {sending() ? 'Отправка…' : <>Отправить за <Star size={12} /> {chosen().stars}</>}
            </button>
            <button type="button" class="vk-button vk-button-secondary" disabled={sending()} onClick={() => setChosen(undefined)}>Назад</button>
          </div>
        </>
      }>
        <div class="vk-modal-body vk-gift-shop">
          <p class="vk-page-text">
            Подарок для <b>{recipient()}</b> можно оставить на странице или конвертировать в Stars.
          </p>

          <VKTabs
            idPrefix="vk-gift-shop"
            label="Тип подарков"
            active={tab()}
            onChange={setTab}
            tabs={[
              {id: 'all', title: 'Все'},
              {id: 'limited', title: 'Лимитированные'},
              {id: 'unlimited', title: 'Обычные'}
            ]}
          />

          <Show when={!catalog.error} fallback={<p class="vk-modal-error">Не удалось загрузить каталог подарков.</p>}>
            <Show when={catalog()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
              <Show when={visible().length} fallback={<p class="vk-page-text vk-page-text-secondary">Здесь пока ничего нет.</p>}>
                <ul class="vk-gift-shop-grid" id={`vk-gift-shop-panel-${tab()}`} role="tabpanel" aria-labelledby={`vk-gift-shop-tab-${tab()}`}>
                  <For each={visible()}>
                    {(gift) => (
                      <li>
                        <button type="button" class="vk-gift-tile" onClick={() => choose(gift)}>
                          <VKGiftSticker doc={gift.sticker} renderer={renderer} size={64} />
                          <span class="vk-gift-tile-price"><Star /> {gift.stars}</span>
                          <Show when={gift.availability_remains !== undefined}>
                            <span class="vk-gift-tile-left">{gift.availability_remains} из {gift.availability_total}</span>
                          </Show>
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </Show>
        </div>
        <div class="vk-modal-foot vk-gift-shop-foot">
          <span class="vk-gift-balance">Ваш баланс: <Star size={12} /> {balance() ?? '…'}</span>
          <button type="button" class="vk-link-button" onClick={openClassic}>Пополнить</button>
          <button type="button" class="vk-button vk-button-secondary" onClick={props.onClose}>Закрыть</button>
        </div>
      </Show>
    </VKModal>
  );
}

export const openVKGiftShop = (peerId: PeerId) =>
  openVKModal((p) => <VKGiftShopModal peerId={peerId} onClose={p.onClose} />);

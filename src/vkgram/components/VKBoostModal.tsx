import {createResource, createSignal, Show} from 'solid-js';
import type {Chat} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import {toast} from '@components/toast';
import {copyTextToClipboard} from '@helpers/clipboard';
import VKModal from '@/vkgram/components/VKModal';
import {apiErrorType, openVKModal} from '@/vkgram/modals';

/** «1 буст», «2 буста», «5 бустов» */
function boostsText(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'буст' :
    mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'буста' : 'бустов';
  return `${count} ${word}`;
}

type Replace = {slot: number, fromTitle: string};

/**
 * «Забустить канал»: the level of the channel, how far it is from the next one, and the button that
 * spends one of the person's boost slots on it — Web K's own manager (`appBoostsManager`:
 * `premium.getBoostsStatus`, `premium.getMyBoosts`, `premium.applyBoost`). Boosting is a Premium
 * feature: without it the window says so and leads to Web K's Premium window. A slot that is busy
 * with another channel is moved only after the person agrees to it.
 */
export default function VKBoostModal(props: {peerId: PeerId, onClose: () => void}) {
  const managers = rootScope.managers;
  const peers = usePeers();
  const channel = () => peers[props.peerId] as Chat.channel | undefined;

  const [status, {refetch}] = createResource(async() => {
    return managers.appBoostsManager.getBoostsStatus(props.peerId);
  });

  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [replace, setReplace] = createSignal<Replace>();

  const level = () => status()?.level ?? 0;
  const boosts = () => status()?.boosts ?? 0;
  const from = () => status()?.current_level_boosts ?? 0;
  const to = () => status()?.next_level_boosts as number | undefined;
  const percent = () => {
    if(to() === undefined) return 100;
    const span = to()! - from();
    return span > 0 ? Math.min(100, Math.max(0, ((boosts() - from()) / span) * 100)) : 0;
  };
  const isMine = () => !!status()?.pFlags?.my_boost;

  const apply = async(slot: number) => {
    // a click that lands while another apply is in flight must not repeat it
    if(busy()) return;
    setBusy(true);
    try {
      await managers.appBoostsManager.applyBoost(props.peerId, [slot]);
      setReplace(undefined);
      toast('Канал забустен');
      await refetch();
    } catch(err) {
      console.error('VKgram: premium.applyBoost failed', err);
      setError('Не удалось применить буст. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  const boost = async() => {
    setError(undefined);
    if(!rootScope.premium) {
      const {default: showPremiumPopup} = await import('@components/popups/premium');
      showPremiumPopup();
      return;
    }

    setBusy(true);
    try {
      const mine = await managers.appBoostsManager.getMyBoosts();
      const now = Math.floor(Date.now() / 1000);
      const boosts: any[] = mine?.my_boosts ?? [];
      const ready = (item: any) => !item.cooldown_until_date || item.cooldown_until_date <= now;

      // an unused slot first; then a slot that sits on another channel and has cooled down
      const unused = boosts.find((item) => !item.peer && ready(item));
      if(unused) {
        setBusy(false);
        await apply(unused.slot);
        return;
      }

      const movable = boosts.find((item) => item.peer && ready(item));
      if(movable) {
        const chats: any[] = mine?.chats ?? [];
        const peerChannelId = movable.peer?.channel_id ?? movable.peer?.chat_id;
        const other = chats.find((chat) => chat.id === peerChannelId);
        setReplace({slot: movable.slot, fromTitle: other?.title ?? 'другого канала'});
        return;
      }

      const next = Math.min(...boosts.map((item) => item.cooldown_until_date || Infinity));
      setError(Number.isFinite(next) ?
        'Все ваши бусты на перезарядке. Следующий можно использовать ' + new Date(next * 1000).toLocaleString('ru') + '.' :
        'У вас нет доступных бустов.');
    } catch(err) {
      console.error('VKgram: premium.getMyBoosts failed', err);
      setError(apiErrorType(err) === 'PREMIUM_ACCOUNT_REQUIRED' ?
        'Бустить каналы можно с Telegram Premium.' :
        'Не удалось получить ваши бусты.');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    const url = status()?.boost_url;
    if(!url) return;
    copyTextToClipboard(url);
    toast('Ссылка для бустов скопирована');
  };

  return (
    <VKModal title="Буст канала" width={400} closeDisabled={busy()} onClose={props.onClose}>
      <div class="vk-modal-body vk-boost">
        <div class="vk-boost-head">
          <AvatarNewTsx peerId={props.peerId} size={40} />
          <div class="vk-boost-head-info">
            <div class="vk-boost-title">{channel()?.title}</div>
            <div class="vk-page-text-secondary">
              <Show when={status()} fallback="Загрузка…">Уровень {level()}</Show>
            </div>
          </div>
        </div>

        <Show when={status.error}>
          <p class="vk-modal-error" role="alert">Не удалось загрузить информацию о бустах канала.</p>
        </Show>

        <Show when={status()}>
          <div
            class="vk-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent())}
            aria-label="Прогресс до следующего уровня"
          >
            <div class="vk-progress-fill" style={{width: percent() + '%'}} />
          </div>
          <div class="vk-progress-legend">
            <span>Уровень {level()}</span>
            <Show when={to() !== undefined} fallback={<span>Максимальный</span>}>
              <span>Уровень {level() + 1}</span>
            </Show>
          </div>

          <dl class="vk-gift-table">
            <div class="vk-gift-table-row">
              <dt>Бустов</dt>
              <dd>{boosts()}<Show when={to() !== undefined}>{' из ' + to()}</Show></dd>
            </div>
            <Show when={to() !== undefined}>
              <div class="vk-gift-table-row">
                <dt>До уровня {level() + 1}</dt>
                <dd>{boostsText(Math.max(0, to()! - boosts()))}</dd>
              </div>
            </Show>
            <Show when={status()?.premium_audience?.total}>
              <div class="vk-gift-table-row">
                <dt>Premium-подписчики</dt>
                <dd>{Math.round(status().premium_audience.part)} из {Math.round(status().premium_audience.total)}</dd>
              </div>
            </Show>
          </dl>

          <p class="vk-page-text vk-page-text-secondary vk-boost-note">
            Чем выше уровень, тем больше возможностей получает канал: истории, смена цвета и эмодзи оформления, свой фон и другое.
            <Show when={isMine()}> Вы уже бустите этот канал.</Show>
          </p>
        </Show>

        <Show when={replace()} keyed>
          {(item) => (
            <p class="vk-modal-warning">
              Все ваши бусты заняты. Буст канала «{item.fromTitle}» будет перенесён на этот канал.
              {' '}
              <button type="button" class="vk-link-button" disabled={busy()} onClick={() => apply(item.slot)}>Перенести</button>
            </p>
          )}
        </Show>

        <Show when={error()}>
          <p class="vk-modal-error" role="alert">{error()}</p>
        </Show>
      </div>

      <div class="vk-modal-foot">
        <button type="button" class="vk-button" disabled={busy() || !status()} onClick={boost}>
          {busy() ? 'Подождите…' : 'Забустить канал'}
        </button>
        <Show when={status()?.boost_url}>
          <button type="button" class="vk-button vk-button-secondary" onClick={copyLink}>Копировать ссылку</button>
        </Show>
        <button type="button" class="vk-button vk-button-secondary" disabled={busy()} onClick={props.onClose}>Закрыть</button>
      </div>
    </VKModal>
  );
}

export const openVKBoost = (peerId: PeerId) =>
  openVKModal((p) => <VKBoostModal peerId={peerId} onClose={p.onClose} />);

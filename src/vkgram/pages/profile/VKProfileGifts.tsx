import {createSignal, Show} from 'solid-js';
import type {MyStarGift} from '@appManagers/appGiftsManager';
import rootScope from '@lib/rootScope';
import {StarGiftsGrid} from '@components/stargifts/stargiftsGrid';
import {openWebKLeftTab} from '@/vkgram/webk';

const PAGE = 8;

/**
 * «Подарки» of «Моя страница». Data: appGiftsManager.getProfileGifts (the
 * gifts shown on the profile, with the server's own paging). Rendering: Web
 * K's StarGiftsGrid; a click opens Web K's gift info popup. Managing gifts
 * (pin, transfer, collections) stays in Web K's profile for now.
 */
export default function VKProfileGifts(props: {scrollParent: HTMLElement}) {
  const [gifts, setGifts] = createSignal<MyStarGift[]>();
  const [count, setCount] = createSignal(0);
  const [next, setNext] = createSignal<string>();
  const [loading, setLoading] = createSignal(false);

  const loadPage = async() => {
    if(loading()) return;
    setLoading(true);
    try {
      const result = await rootScope.managers.appGiftsManager.getProfileGifts({
        peerId: rootScope.myId,
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

  const openInfo = async(gift: MyStarGift) => {
    const {default: showStarGiftInfoPopup} = await import('@components/popups/starGiftInfo');
    showStarGiftInfoPopup({gift});
  };

  return (
    <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-gifts-title">
      <h2 id="vk-profile-gifts-title" class="vk-block-title">
        Подарки
        <Show when={count()}>
          <span class="vk-page-text-secondary"> {count()}</span>
        </Show>
      </h2>
      <Show when={gifts()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
        <Show when={gifts().length} fallback={<p class="vk-page-text vk-page-text-secondary">Подарков пока нет.</p>}>
          {/* keyed: the grid takes its items once, a new page re-renders it */}
          <Show when={gifts()} keyed>
            {(items) => (
              <StarGiftsGrid
                class="vk-gift-grid"
                items={items}
                view="profile"
                profilePeerId={rootScope.myId}
                autoplay={false}
                scrollParent={props.scrollParent}
                onClick={openInfo}
              />
            )}
          </Show>
        </Show>
        <div class="vk-profile-actions">
          <Show when={next()}>
            <button type="button" class="vk-button vk-button-secondary" disabled={loading()} onClick={loadPage}>
              {loading() ? 'Загрузка…' : `Посмотреть все (${count()})`}
            </button>
          </Show>
          <button
            type="button"
            class="vk-link-button"
            onClick={() => openWebKLeftTab('AppPrivacyGiftsTab', () => rootScope.managers.appPrivacyManager.getGlobalPrivacySettings())}
          >
            Настройки подарков
          </button>
        </div>
      </Show>
    </section>
  );
}

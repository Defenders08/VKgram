import {Component, createSignal, For, onCleanup, onMount, Show} from 'solid-js';
import type {User, UserFull} from '@layer';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {confirmVKLogout} from '@/vkgram/logout';
import {setVKSettingsRoute, vkSettingsRoute} from '@/vkgram/pages/settings/route';
import VKTabs, {VKTabItem} from '@/vkgram/components/VKTabs';
import VKSettingsPrivacy from '@/vkgram/pages/settings/VKSettingsPrivacy';
import VKSettingsLanguage from '@/vkgram/pages/settings/VKSettingsLanguage';
import VKSettingsSessions from '@/vkgram/pages/settings/VKSettingsSessions';
import VKSettingsConfig from '@/vkgram/pages/settings/VKSettingsConfig';
import VKSettingsMobileNav from '@/vkgram/pages/settings/VKSettingsMobileNav';
import VKSettingsAutoDownload from '@/vkgram/pages/settings/VKSettingsAutoDownload';
import {openVKCacheLimit} from '@/vkgram/components/VKCacheLimitModal';
import VKSettingsStorage from '@/vkgram/pages/settings/VKSettingsStorage';
import VKProfileEditForm from '@/vkgram/pages/profile/VKProfileEditForm';
import VKProfileBirthday from '@/vkgram/pages/profile/VKProfileBirthday';
import VKProfilePersonalChannel from '@/vkgram/pages/profile/VKProfilePersonalChannel';
import VKGiftsPrivacy from '@/vkgram/pages/settings/VKGiftsPrivacy';

/**
 * REAL    — works here, through Web K's managers / stores.
 * PARTIAL — part of it works here; the rest opens Web K's own screen.
 * TODO    — only marked; nothing pretends to be saved.
 */
type VKSettingStatus = 'REAL' | 'PARTIAL' | 'TODO';

type VKSettingItem = {
  id: string,
  title: string,
  status: VKSettingStatus,
  note?: string,
  content?: Component,
  // the Web K screen that covers what isn't here yet
  webK?: {title: string, open: () => void}
};

/**
 * telegram — the settings that exist in Telegram itself (its account, screens
 *           and switches — profile, privacy, chats…): VKgram renders its own
 *           UI over them.
 * vkgram  — VKgram's own features that Telegram does not have: the local
 *           settings, the config export/import and so on.
 */
type VKSettingGroup = 'telegram' | 'vkgram';

type VKSettingCategory = {
  id: string,
  title: string,
  group: VKSettingGroup,
  // a category rendered as one piece instead of headed items («Сессии», «Язык»)
  content?: Component,
  items: VKSettingItem[]
};

// * Item contents

function ProfileEditContent() {
  const user = useUser(() => rootScope.myId.toUserId()) as () => User.user;
  const fullPeer = useFullPeer(rootScope.myId);
  return (
    <Show when={user() && fullPeer()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      {/* bare: the item above holds the block and the title */}
      <VKProfileEditForm
        user={user()}
        userFull={fullPeer() as UserFull.userFull}
        onDone={() => setVKSettingsRoute({category: 'profile'})}
        variant="bare"
      />
    </Show>
  );
}

function BirthdayContent() {
  const fullPeer = useFullPeer(rootScope.myId);
  return (
    <dl class="vk-profile-info-list">
      <VKProfileBirthday birthday={(fullPeer() as UserFull.userFull)?.birthday} />
    </dl>
  );
}

function PersonalChannelContent() {
  const fullPeer = useFullPeer(rootScope.myId);
  // bare: the item above holds the block and the title
  return <VKProfilePersonalChannel channelId={(fullPeer() as UserFull.userFull)?.personal_channel_id?.toChatId()} bare />;
}

// the whole «Сессии» tab: the sessions list and the way out of the account
function SessionsContent() {
  return (
    <div class="vk-settings-item">
      <p class="vk-page-text vk-page-text-secondary">Устройство в Telegram — это активный сеанс, поэтому список здесь один.</p>
      <VKSettingsSessions />
      <div class="vk-profile-actions">
        <button type="button" class="vk-button vk-button-danger" onClick={() => confirmVKLogout()}>Выйти из аккаунта</button>
      </div>
    </div>
  );
}

const privacyItem = (id: string, title: string, key: Parameters<typeof VKSettingsPrivacy>[0]['privacyKey'], question: string, rest?: Partial<VKSettingItem>): VKSettingItem => ({
  id,
  title,
  status: 'REAL',
  content: () => <VKSettingsPrivacy privacyKey={key} question={question} />,
  ...rest
});

const CATEGORIES: VKSettingCategory[] = [{
  id: 'profile',
  title: 'Профиль',
  group: 'telegram',
  items: [
    {
      id: 'edit',
      title: 'Изменить профиль',
      status: 'REAL',
      note: 'Имя пользователя — здесь же, с проверкой, свободно ли имя.',
      content: ProfileEditContent
    },
    {id: 'birthday', title: 'Дата рождения', status: 'REAL', content: BirthdayContent},
    {id: 'channel', title: 'Личный канал', status: 'REAL', content: PersonalChannelContent}
  ]
}, {
  id: 'privacy',
  title: 'Приватность',
  group: 'telegram',
  items: [
    privacyItem('phone', 'Номер телефона', 'inputPrivacyKeyPhoneNumber', 'Кто видит мой номер телефона'),
    privacyItem('lastSeen', 'Последний визит и онлайн', 'inputPrivacyKeyStatusTimestamp', 'Кто видит время моего последнего визита', {
      note: 'Скрытие времени прочтения — пока только в Telegram.'
    }),
    privacyItem('profilePhoto', 'Фото профиля', 'inputPrivacyKeyProfilePhoto', 'Кто видит мои фотографии профиля'),
    privacyItem('birthday', 'Дата рождения', 'inputPrivacyKeyBirthday', 'Кто видит мою дату рождения'),
    privacyItem('gifts', 'Подарки', 'inputPrivacyKeyStarGiftsAutoSave', 'Чьи подарки показываются в моём профиле', {
      content: () => <VKGiftsPrivacy />
    })
  ]
}, {
  id: 'data',
  title: 'Данные и память',
  group: 'telegram',
  items: [
    {
      id: 'autoDownload',
      title: 'Автозагрузка медиа',
      status: 'REAL',
      content: VKSettingsAutoDownload
    },
    {
      id: 'storage',
      title: 'Память',
      status: 'PARTIAL',
      note: 'Оценка по кэшу браузера.',
      content: VKSettingsStorage,
      webK: {title: 'Срок и лимит кэша', open: openVKCacheLimit}
    }
  ]
}, {
  id: 'sessions',
  title: 'Сессии',
  group: 'telegram',
  items: [],
  content: SessionsContent
}, {
  id: 'language',
  title: 'Язык',
  group: 'telegram',
  items: [],
  content: VKSettingsLanguage
}, {
  id: 'navbar',
  title: 'Навбар',
  group: 'vkgram',
  items: [],
  content: VKSettingsMobileNav
}, {
  id: 'app',
  title: 'Приложение',
  group: 'vkgram',
  items: [
    {
      id: 'config',
      title: 'Экспорт и импорт настроек',
      status: 'REAL',
      note: 'Настройки ленты новостей и списка диалогов — одним файлом.',
      content: VKSettingsConfig
    }
  ]
}];

const toTabs = (categories: VKSettingCategory[]): VKTabItem<string>[] =>
  categories.map((category) => ({id: category.id, title: category.title}));

// the phone strip keeps all the categories in one line; the desktop rail splits
// them into two blocks — Telegram's settings first, VKgram's own under them
const SETTINGS_TABS = toTabs(CATEGORIES);
const TELEGRAM_TABS = toTabs(CATEGORIES.filter((category) => category.group === 'telegram'));
const VKGRAM_TABS = toTabs(CATEGORIES.filter((category) => category.group === 'vkgram'));

/**
 * «Настройки»: VKgram's own structure over Web K's settings. The categories
 * are the tabs of one section (the route's category, or the first one until a
 * choice is made): a right rail of two tab blocks on desktop — Telegram's
 * settings over VKgram's own, the layout of «Новости» / «Друзья» — and one
 * strip above the content on a phone. The panel shows ALL of the active
 * category's items at once — every item is its headed piece, nothing hides
 * behind a row click.
 */
export default function VKPageSettings() {
  // The desktop rail and the mobile strip are separate layouts, only one is
  // mounted at a time (the same split as «Новости»).
  const [isDesktop, setIsDesktop] = createSignal(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 601px)').matches
  );
  onMount(() => {
    const media = window.matchMedia('(min-width: 601px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    onCleanup(() => media.removeEventListener?.('change', update));
  });

  const activeCategory = () => CATEGORIES.find((category) => category.id === vkSettingsRoute().category) ?? CATEGORIES[0];
  const onTab = (id: string) => setVKSettingsRoute({category: id});

  return (
    <div class="vk-page vk-settings">
      <div class="vk-settings-layout">
        <div class="vk-settings-main">
          <section class="vk-block vk-page-block" aria-labelledby="vk-settings-title">
            {/* no visible heading: the page is named by the menu; kept for screen readers */}
            <h1 id="vk-settings-title" class="vk-page-title vk-visually-hidden">Настройки</h1>
            <Show when={!isDesktop()}>
              {/* the mobile strip: the tabs above the content, the rail does not fit */}
              <div class="vk-settings-mobile-tabs">
                <VKTabs
                  tabs={SETTINGS_TABS}
                  active={activeCategory().id}
                  onChange={onTab}
                  idPrefix="vk-settings-mobile"
                  label="Разделы настроек"
                />
              </div>
            </Show>
            <div
              id={`vk-settings-panel-${activeCategory().id}`}
              role="tabpanel"
              aria-labelledby={`vk-settings-mobile-tab-${activeCategory().id} vk-settings-desktop-tab-${activeCategory().id}`}
            >
              <Show
                when={activeCategory().content}
                fallback={
                  <For each={activeCategory().items}>
                    {(item) => (
                      <section class="vk-settings-item" aria-labelledby={`vk-settings-item-${item.id}`}>
                        <h2 id={`vk-settings-item-${item.id}`} class="vk-block-title">{item.title}</h2>
                        <Show when={item.note}>
                          <p class="vk-page-text vk-page-text-secondary">{item.note}</p>
                        </Show>
                        <Show when={item.content}>
                          {(() => {
                            const Content = item.content;
                            return <Content />;
                          })()}
                        </Show>
                        <Show when={item.status === 'TODO' && !item.content}>
                          <p class="vk-page-text vk-page-text-secondary">Скоро.</p>
                        </Show>
                        <Show when={item.webK}>
                          <div class="vk-profile-actions">
                            <button type="button" class="vk-button vk-button-secondary" onClick={() => item.webK.open()}>
                              {item.webK.title} →
                            </button>
                          </div>
                        </Show>
                      </section>
                    )}
                  </For>
                }
              >
                {(() => {
                  const Content = activeCategory().content;
                  return <Content />;
                })()}
              </Show>
            </div>
          </section>
        </div>

        <Show when={isDesktop()}>
          <aside class="vk-settings-side" aria-label="Разделы настроек">
            <section class="vk-block vk-settings-side-block" aria-labelledby="vk-settings-side-telegram-title">
              <h2 id="vk-settings-side-telegram-title" class="vk-block-title">Телеграм</h2>
              <VKTabs
                tabs={TELEGRAM_TABS}
                active={activeCategory().id}
                onChange={onTab}
                idPrefix="vk-settings-desktop"
                label="Настройки Телеграма"
              />
            </section>
            <section class="vk-block vk-settings-side-block" aria-labelledby="vk-settings-side-vkgram-title">
              <h2 id="vk-settings-side-vkgram-title" class="vk-block-title">VKgram</h2>
              <VKTabs
                tabs={VKGRAM_TABS}
                active={activeCategory().id}
                onChange={onTab}
                idPrefix="vk-settings-desktop"
                label="Настройки VKgram"
              />
            </section>
          </aside>
        </Show>
      </div>
    </div>
  );
}

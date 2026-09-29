import {Component, createMemo, For, JSX, Show} from 'solid-js';
import type {User, UserFull} from '@layer';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {useAppSettings} from '@stores/appSettings';
import type {LiteModeKey} from '@helpers/liteMode';
import {openWebKLeftTab} from '@/vkgram/webk';
import {setVKSettingsRoute, vkSettingsRoute} from '@/vkgram/pages/settings/route';
import VKSettingsPrivacy from '@/vkgram/pages/settings/VKSettingsPrivacy';
import VKSettingsNotifications from '@/vkgram/pages/settings/VKSettingsNotifications';
import VKSettingsLanguage from '@/vkgram/pages/settings/VKSettingsLanguage';
import VKSettingsSessions from '@/vkgram/pages/settings/VKSettingsSessions';
import VKProfileEditForm from '@/vkgram/pages/profile/VKProfileEditForm';
import VKProfileBirthday from '@/vkgram/pages/profile/VKProfileBirthday';
import VKProfilePersonalChannel from '@/vkgram/pages/profile/VKProfilePersonalChannel';

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

type VKSettingCategory = {
  id: string,
  title: string,
  items: VKSettingItem[]
};

const STATUS_TITLES: {[status in VKSettingStatus]: string} = {
  REAL: 'Работает',
  PARTIAL: 'Частично',
  TODO: 'Скоро'
};

// * Item contents

function ProfileEditContent() {
  const user = useUser(() => rootScope.myId.toUserId()) as () => User.user;
  const fullPeer = useFullPeer(rootScope.myId);
  return (
    <Show when={user() && fullPeer()} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
      <VKProfileEditForm
        user={user()}
        userFull={fullPeer() as UserFull.userFull}
        onDone={() => setVKSettingsRoute({category: 'profile'})}
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
  return <VKProfilePersonalChannel channelId={(fullPeer() as UserFull.userFull)?.personal_channel_id?.toChatId()} />;
}

// Web K's power-saving switches: liteMode[key] === true means "turned off"
function LiteToggle(props: {liteKey: LiteModeKey, title: string}) {
  const [appSettings, setAppSettings] = useAppSettings();
  const isAll = () => !!appSettings.liteMode?.all;
  return (
    <label class="vk-settings-checkbox">
      <input
        type="checkbox"
        disabled={isAll()}
        checked={!isAll() && !appSettings.liteMode?.[props.liteKey]}
        onChange={(e) => setAppSettings('liteMode', props.liteKey, !e.currentTarget.checked)}
      />
      {props.title}
      <Show when={isAll()}>
        <span class="vk-page-text-secondary"> (выключено режимом энергосбережения)</span>
      </Show>
    </label>
  );
}

const privacyItem = (id: string, title: string, key: Parameters<typeof VKSettingsPrivacy>[0]['privacyKey'], question: string, rest?: Partial<VKSettingItem>): VKSettingItem => ({
  id,
  title,
  status: 'REAL',
  content: () => <VKSettingsPrivacy privacyKey={key} question={question} />,
  ...rest
});

const logOut = async() => {
  const {default: showLogOutPopup} = await import('@components/popups/logOut');
  showLogOutPopup();
};

const CATEGORIES: VKSettingCategory[] = [{
  id: 'profile',
  title: 'Профиль',
  items: [
    {id: 'edit', title: 'Изменить профиль', status: 'REAL', content: ProfileEditContent},
    {id: 'username', title: 'Имя пользователя', status: 'REAL', note: 'Меняется в общей форме профиля, с проверкой, свободно ли имя.', content: ProfileEditContent},
    {id: 'birthday', title: 'Дата рождения', status: 'REAL', content: BirthdayContent},
    {id: 'channel', title: 'Личный канал', status: 'REAL', content: PersonalChannelContent}
  ]
}, {
  id: 'privacy',
  title: 'Приватность',
  items: [
    privacyItem('phone', 'Номер телефона', 'inputPrivacyKeyPhoneNumber', 'Кто видит мой номер телефона'),
    privacyItem('lastSeen', 'Последний визит и онлайн', 'inputPrivacyKeyStatusTimestamp', 'Кто видит время моего последнего визита', {
      note: 'Скрытие времени прочтения — пока только в Telegram.'
    }),
    privacyItem('profilePhoto', 'Фото профиля', 'inputPrivacyKeyProfilePhoto', 'Кто видит мои фотографии профиля'),
    privacyItem('birthday', 'Дата рождения', 'inputPrivacyKeyBirthday', 'Кто видит мою дату рождения'),
    {
      id: 'stories',
      title: 'Истории',
      status: 'TODO',
      note: 'В Telegram нет общей настройки приватности историй: круг зрителей задаётся для каждой истории при публикации, а публикации в Web K нет.'
    },
    privacyItem('gifts', 'Подарки', 'inputPrivacyKeyStarGiftsAutoSave', 'Чьи подарки показываются в моём профиле', {
      status: 'PARTIAL',
      note: 'Какие подарки принимать и кнопка подарка в чатах — пока в Telegram.',
      webK: {
        title: 'Остальные настройки подарков',
        open: () => openWebKLeftTab('AppPrivacyGiftsTab', () => rootScope.managers.appPrivacyManager.getGlobalPrivacySettings())
      }
    })
  ]
}, {
  id: 'notifications',
  title: 'Уведомления',
  items: [
    {id: 'users', title: 'Сообщения', status: 'REAL', content: () => <VKSettingsNotifications scope="inputNotifyUsers" />},
    {id: 'chats', title: 'Группы', status: 'REAL', content: () => <VKSettingsNotifications scope="inputNotifyChats" />},
    {id: 'broadcasts', title: 'Каналы', status: 'REAL', content: () => <VKSettingsNotifications scope="inputNotifyBroadcasts" />},
    {id: 'calls', title: 'Звонки', status: 'TODO', note: 'В Web K нет отдельной настройки уведомлений о звонках.'},
    {
      id: 'stories',
      title: 'Истории',
      status: 'PARTIAL',
      note: 'Уведомления о новых историях настраиваются пока в Telegram.',
      webK: {title: 'Уведомления в Telegram', open: () => openWebKLeftTab('AppNotificationsTab')}
    }
  ]
}, {
  id: 'chats',
  title: 'Чаты',
  items: [
    {
      id: 'appearance',
      title: 'Внешний вид чатов',
      status: 'PARTIAL',
      note: 'Тема, размер текста и прочее — пока в Telegram.',
      webK: {title: 'Общие настройки Telegram', open: () => openWebKLeftTab('AppGeneralSettingsTab')}
    },
    {
      id: 'background',
      title: 'Фон',
      status: 'PARTIAL',
      note: 'Выбор фона — пока в Telegram.',
      webK: {title: 'Фон чатов в Telegram', open: () => openWebKLeftTab('AppChatBackgroundTab')}
    },
    {id: 'animations', title: 'Анимации', status: 'REAL', content: () => <LiteToggle liteKey="animations" title="Анимации интерфейса" />},
    {
      id: 'autoplay',
      title: 'Автовоспроизведение',
      status: 'REAL',
      content: () => (
        <fieldset class="vk-settings-fieldset">
          <LiteToggle liteKey="gif" title="GIF" />
          <LiteToggle liteKey="video" title="Видео" />
        </fieldset>
      )
    }
  ]
}, {
  id: 'media',
  title: 'Медиа',
  items: [
    {
      id: 'autodownload',
      title: 'Автозагрузка',
      status: 'PARTIAL',
      note: 'Правила автозагрузки — пока в Telegram.',
      webK: {title: 'Данные и память в Telegram', open: () => openWebKLeftTab('AppDataAndStorageTab')}
    },
    {id: 'video', title: 'Видео', status: 'REAL', content: () => <LiteToggle liteKey="video" title="Автовоспроизведение видео" />},
    {id: 'gif', title: 'GIF', status: 'REAL', content: () => <LiteToggle liteKey="gif" title="Автовоспроизведение GIF" />},
    {id: 'music', title: 'Музыка', status: 'TODO', note: 'Отдельных настроек музыки в Web K нет.'}
  ]
}, {
  id: 'account',
  title: 'Аккаунт',
  items: [
    {id: 'sessions', title: 'Сессии', status: 'REAL', content: VKSettingsSessions},
    {id: 'devices', title: 'Устройства', status: 'REAL', note: 'В Telegram устройство — это активный сеанс, поэтому здесь тот же список.', content: VKSettingsSessions},
    {id: 'language', title: 'Язык', status: 'REAL', content: VKSettingsLanguage},
    {id: 'logout', title: 'Выход', status: 'REAL', content: () => (
      <div class="vk-profile-actions">
        <button type="button" class="vk-button" onClick={logOut}>Выйти из аккаунта</button>
      </div>
    )}
  ]
}];

function StatusBadge(props: {status: VKSettingStatus}) {
  return <span class={`vk-settings-status is-${props.status.toLowerCase()}`}>{STATUS_TITLES[props.status]}</span>;
}

/**
 * «Настройки»: VKgram's own structure over Web K's settings. Navigation is
 * local (category → item) and stays in this content area.
 */
export default function VKPageSettings() {
  const category = createMemo(() => CATEGORIES.find((category) => category.id === vkSettingsRoute().category));
  const item = createMemo(() => category()?.items.find((item) => item.id === vkSettingsRoute().item));

  const Breadcrumbs = (): JSX.Element => (
    <nav class="vk-settings-breadcrumbs" aria-label="Путь">
      <button type="button" class="vk-link-button" onClick={() => setVKSettingsRoute({})}>Настройки</button>
      <Show when={category()}>
        {' › '}
        <button type="button" class="vk-link-button" onClick={() => setVKSettingsRoute({category: category().id})}>
          {category().title}
        </button>
      </Show>
    </nav>
  );

  return (
    <div class="vk-page vk-settings">
      <Show when={category()} fallback={
        <section class="vk-block vk-page-block" aria-labelledby="vk-settings-title">
          <h1 id="vk-settings-title" class="vk-block-title">Настройки</h1>
          <ul class="vk-settings-list">
            <For each={CATEGORIES}>
              {(category) => (
                <li>
                  <button type="button" class="vk-settings-row" onClick={() => setVKSettingsRoute({category: category.id})}>
                    {category.title}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>
      }>
        <Show when={item()} fallback={
          <section class="vk-block vk-page-block" aria-labelledby="vk-settings-category-title">
            <Breadcrumbs />
            <h1 id="vk-settings-category-title" class="vk-block-title">{category().title}</h1>
            <ul class="vk-settings-list">
              <For each={category().items}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      class="vk-settings-row"
                      onClick={() => setVKSettingsRoute({category: category().id, item: item.id})}
                    >
                      {item.title}
                      <StatusBadge status={item.status} />
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </section>
        }>
          {/* keyed: another item gets fresh state */}
          <Show when={item()} keyed>
            {(item) => (
              <section class="vk-block vk-page-block" aria-labelledby="vk-settings-item-title">
                <Breadcrumbs />
                <h1 id="vk-settings-item-title" class="vk-block-title">
                  {item.title} <StatusBadge status={item.status} />
                </h1>
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
          </Show>
        </Show>
      </Show>
    </div>
  );
}

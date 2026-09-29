import {createMemo, createSignal, For, JSX, Show} from 'solid-js';
import type {User, UserFull} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import rootScope from '@lib/rootScope';
import {useUser} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import {pickAvatarAndUpload} from '@components/avatarEdit';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import VKProfileEditForm from '@/vkgram/pages/profile/VKProfileEditForm';
import VKProfileBirthday from '@/vkgram/pages/profile/VKProfileBirthday';
import VKProfilePersonalChannel from '@/vkgram/pages/profile/VKProfilePersonalChannel';
import VKProfileMusic from '@/vkgram/pages/profile/VKProfileMusic';
import {VKProfileStories, VKProfileStoriesArchive} from '@/vkgram/pages/profile/VKProfileStories';
import VKProfileGifts from '@/vkgram/pages/profile/VKProfileGifts';

/**
 * «Моя страница» — the signed-in user's profile in VKgram markup.
 *
 * No data of its own: the user comes from Web K's reactive peer store
 * (`useUser`), bio / birthday from its full-peer store (`useFullPeer`), the
 * avatar is Web K's avatar component. Edits go through Web K's managers, and
 * the stores push the result back here — no reload, no manual refresh.
 */
export default function VKPageProfile() {
  const myPeerId = rootScope.myId;
  const user = useUser(() => myPeerId.toUserId()) as () => User.user;
  const fullPeer = useFullPeer(myPeerId);
  const userFull = () => fullPeer() as UserFull.userFull;

  const [isEditing, setIsEditing] = createSignal(false);
  const [isAvatarUploading, setIsAvatarUploading] = createSignal(false);

  const fullName = () => [user()?.first_name, user()?.last_name].filter(Boolean).join(' ');
  const usernames = createMemo(() => getPeerActiveUsernames(user()));
  const phone = createMemo(() => {
    const raw = user()?.phone;
    if(!raw) return;
    const {formatted, code} = formatPhoneNumber(raw);
    return (code ? '+' : '') + formatted;
  });
  // the page scrolls itself; the gifts grid lazy-loads against it
  const [pageEl, setPageEl] = createSignal<HTMLDivElement>();

  // Web K's own flow: file picker → media editor → upload → uploadProfilePhoto.
  // The new photo arrives through `avatar_update`, which AvatarNew listens to.
  const changeAvatar = () => {
    pickAvatarAndUpload({
      managers: rootScope.managers,
      mode: 'self',
      onUploadStart: (progress) => {
        setIsAvatarUploading(true);
        progress.catch(() => setIsAvatarUploading(false));
      },
      onUploaded: () => setIsAvatarUploading(false)
    });
  };

  return (
    <div class="vk-page vk-profile" ref={setPageEl}>
      <Show
        when={user()}
        fallback={<div class="vk-block vk-page-block vk-page-text-secondary">Загрузка профиля…</div>}
      >
        {/* ProfileHeader */}
        <section class="vk-block vk-profile-header" aria-labelledby="vk-profile-name">
          <div class="vk-profile-avatar">
            <AvatarNewTsx peerId={myPeerId} size={120} isBig />
            <button
              type="button"
              class="vk-link-button"
              disabled={isAvatarUploading()}
              onClick={changeAvatar}
            >
              {isAvatarUploading() ? 'Загрузка фотографии…' : 'Изменить фотографию'}
            </button>
          </div>

          <div class="vk-profile-main">
            <h1 id="vk-profile-name" class="vk-profile-name">{fullName()}</h1>
            <Show when={usernames().length}>
              <div class="vk-profile-username">
                {usernames().map((username) => '@' + username).join(', ')}
              </div>
            </Show>
            <Show when={userFull()?.about}>
              <p class="vk-profile-about">{userFull().about}</p>
            </Show>

            {/* ProfileInfo */}
            <dl class="vk-profile-info">
              <ProfileInfoRow label="Имя">{user().first_name}</ProfileInfoRow>
              <ProfileInfoRow label="Фамилия">{user().last_name}</ProfileInfoRow>
              <ProfileInfoRow label="Имя пользователя">
                {usernames().length ? usernames().map((username) => '@' + username).join(', ') : undefined}
              </ProfileInfoRow>
              <ProfileInfoRow label="О себе">{userFull()?.about}</ProfileInfoRow>
              <VKProfileBirthday birthday={userFull()?.birthday} />
              <ProfileInfoRow label="Телефон">{phone()}</ProfileInfoRow>
            </dl>

            {/* ProfileActions */}
            <Show when={!isEditing()}>
              <div class="vk-profile-actions">
                <button type="button" class="vk-button" onClick={() => setIsEditing(true)}>
                  Изменить профиль
                </button>
              </div>
            </Show>
          </div>
        </section>

        <Show when={isEditing()}>
          <VKProfileEditForm
            user={user()}
            userFull={userFull()}
            onDone={() => setIsEditing(false)}
          />
        </Show>

        <VKProfilePersonalChannel channelId={userFull()?.personal_channel_id?.toChatId()} />
        <VKProfileMusic profileTrack={userFull()?.saved_music as MyDocument} />
        <VKProfileStories />
        <VKProfileStoriesArchive />
        <Show when={pageEl()}>
          <VKProfileGifts scrollParent={pageEl()} />
        </Show>

        {/* ProfileContent — groundwork for the wall and media */}
        <For each={PROFILE_CONTENT_SECTIONS}>
          {(section) => (
            <section class="vk-block vk-profile-section" aria-label={section.title}>
              <h2 class="vk-block-title">{section.title}</h2>
              <p class="vk-page-text vk-page-text-secondary">{section.empty}</p>
            </section>
          )}
        </For>
      </Show>
    </div>
  );
}

const PROFILE_CONTENT_SECTIONS = [
  {title: 'Стена', empty: 'Раздел в разработке.'},
  {title: 'Фотографии', empty: 'Раздел в разработке.'},
  {title: 'Видео', empty: 'Раздел в разработке.'},
  {title: 'Музыка', empty: 'Раздел в разработке.'}
];

// A label/value row, hidden when the value is missing.
function ProfileInfoRow(props: {label: string, children: JSX.Element}) {
  return (
    <Show when={props.children}>
      <div class="vk-profile-info-row">
        <dt>{props.label}</dt>
        <dd>{props.children}</dd>
      </div>
    </Show>
  );
}

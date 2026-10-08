import {createMemo, createSignal, Match, Show, Switch} from 'solid-js';
import type {User, UserFull} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import I18n from '@lib/langPack';
import {useUser} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import {openPeerAvatar} from '@/vkgram/utils/openPeerAvatar';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import VKUserStatus from '@/vkgram/components/VKUserStatus';
import VKProfileInfoRow from '@/vkgram/pages/profile/VKProfileInfoRow';
import VKProfileMusicList from '@/vkgram/pages/profile/VKProfileMusicList';
import {VKProfileCommonGroups} from '@/vkgram/pages/profile/VKProfileSideBlocks';
import {VKProfileStories} from '@/vkgram/pages/profile/VKProfileStories';
import VKProfileGifts from '@/vkgram/pages/profile/VKProfileGifts';

/**
 * The page of another user (desktop): two columns like «Моя страница». The
 * narrow one — the avatar as a block of its own, «Написать сообщение», the
 * music and the groups in common; the wide one — the profile information,
 * stories and gifts; the user's online status stands beside the name (Web K's
 * own status string). It only reads: the user from Web K's reactive peer store
 * (`useUser`), the bio / birthday / counters from its full-peer store
 * (`useFullPeer`). A block whose data the user hides or doesn't have is not
 * drawn. Going back is in the top bar (VKHeader).
 */
export default function VKPageUserProfile(props: {peerId: PeerId}) {
  const user = useUser(() => props.peerId.toUserId()) as () => User.user;
  const fullPeer = useFullPeer(props.peerId);
  const userFull = () => fullPeer() as UserFull.userFull;
  const [pageEl, setPageEl] = createSignal<HTMLDivElement>();

  const isDeleted = () => !!user()?.pFlags?.deleted;
  const fullName = () => isDeleted() ?
    'Удалённый аккаунт' :
    [user()?.first_name, user()?.last_name].filter(Boolean).join(' ');
  const usernames = createMemo(() => getPeerActiveUsernames(user()));
  const phone = createMemo(() => {
    const raw = user()?.phone;
    if(!raw) return;
    const {formatted, code} = formatPhoneNumber(raw);
    return (code ? '+' : '') + formatted;
  });
  const birthday = createMemo(() => {
    const value = userFull()?.birthday;
    if(!value) return;
    return new I18n.IntlDateElement({
      date: new Date(value.year ?? new Date().getFullYear(), value.month - 1, value.day),
      options: {day: 'numeric', month: 'long', year: value.year ? 'numeric' : undefined}
    }).element;
  });

  return (
    <div class="vk-page vk-profile" ref={setPageEl}>
      <Switch>
        <Match when={!user()}>
          <div class="vk-block vk-page-block vk-page-text-secondary">Загрузка профиля…</div>
        </Match>

        <Match when={user()}>
          <div class="vk-cols">
            <div class="vk-col-side">
              <section class="vk-block vk-profile-avatar-block">
                <button
                  type="button"
                  class="vk-profile-avatar-edit"
                  aria-label="Открыть фотографию"
                  onClick={(e) => void openPeerAvatar(e.currentTarget, props.peerId)}
                >
                  <AvatarNewTsx peerId={props.peerId} size={120} isBig />
                </button>
              </section>

              <Show when={!isDeleted()}>
                <div class="vk-profile-side-actions">
                  <button type="button" class="vk-button" onClick={() => openVKChat(props.peerId)}>
                    Написать сообщение
                  </button>
                </div>
              </Show>

              <VKProfileMusicList peerId={props.peerId} profileTrack={userFull()?.saved_music as MyDocument} />
              {/* only when Telegram says there are any */}
              <Show when={userFull()?.common_chats_count}>
                <VKProfileCommonGroups peerId={props.peerId} count={userFull().common_chats_count} />
              </Show>
            </div>

            <div class="vk-col-main">
              <section class="vk-block vk-profile-summary" aria-labelledby="vk-profile-name">
                <div class="vk-profile-name-row">
                  <h1 id="vk-profile-name" class="vk-profile-name">{fullName()}</h1>
                  <VKUserStatus user={user()} />
                </div>
                <Show when={usernames().length}>
                  <div class="vk-profile-username">
                    {usernames().map((username) => '@' + username).join(', ')}
                  </div>
                </Show>
                <Show when={userFull()?.about}>
                  <p class="vk-profile-about">{userFull().about}</p>
                </Show>

                <Show when={birthday() || phone()}>
                  <dl class="vk-profile-info">
                    <VKProfileInfoRow label="День рождения">{birthday()}</VKProfileInfoRow>
                    <VKProfileInfoRow label="Телефон">{phone()}</VKProfileInfoRow>
                  </dl>
                </Show>
              </section>

              <VKProfileStories peerId={props.peerId} hideWhenEmpty />
              <Show when={pageEl()}>
                <VKProfileGifts peerId={props.peerId} scrollParent={pageEl()} hideWhenEmpty />
              </Show>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  );
}

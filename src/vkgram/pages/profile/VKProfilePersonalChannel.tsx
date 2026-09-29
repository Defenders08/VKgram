import {createMemo, createSignal, Show} from 'solid-js';
import type {Chat} from '@layer';
import rootScope from '@lib/rootScope';
import {useChat} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import {toastNew} from '@components/toast';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {openWebKChat, openWebKLeftTab} from '@/vkgram/webk';

/**
 * Personal channel of «Моя страница». Data: `personal_channel_id` of the
 * full user + the channel from Web K's peer store. Actions: the same picker
 * and appProfileManager.updatePersonalChannel as Web K's edit profile tab;
 * creating a channel is Web K's own new-channel flow.
 */
export default function VKProfilePersonalChannel(props: {channelId?: ChatId}) {
  const managers = rootScope.managers;
  const channel = useChat(() => props.channelId) as () => Chat.channel;
  const username = createMemo(() => getPeerActiveUsernames(channel())[0]);
  const [busy, setBusy] = createSignal(false);

  const update = async(channelId?: ChatId) => {
    setBusy(true);
    try {
      await managers.appProfileManager.updatePersonalChannel(channelId);
    } catch(err) {
      console.error('VKgram: updatePersonalChannel failed', err);
      toastNew({langPackKey: 'Error.AnError'});
    } finally {
      setBusy(false);
    }
  };

  // Web K's picker: only public channels you own can be personal
  const pick = async() => {
    let channelIds: ChatId[];
    try {
      channelIds = await managers.appProfileManager.getAdminedPersonalChannels();
    } catch(err) {
      console.error('VKgram: getAdminedPersonalChannels failed', err);
      toastNew({langPackKey: 'Error.AnError'});
      return;
    }

    if(!channelIds.length) {
      toastNew({langPackKey: 'EditProfile.PersonalChannel.NoChannels'});
      return;
    }

    const peerIds = channelIds.map((id) => id.toPeerId(true));
    const {default: showPickUserPopup} = await import('@components/popups/pickUser');
    showPickUserPopup({
      titleLangKey: 'EditProfile.PersonalChannel.PickerTitle',
      peerType: ['custom'],
      getMoreCustom: async() => ({result: peerIds, isEnd: true}),
      noSearch: true,
      onSelect: (chosen) => {
        const chatId = chosen[0].peerId.toChatId();
        if(chatId !== props.channelId) update(chatId);
      }
    });
  };

  const unlink = async() => {
    const {default: confirmationPopup} = await import('@components/confirmationPopup');
    try {
      await confirmationPopup({
        titleLangKey: 'EditProfile.PersonalChannel.Remove',
        descriptionLangKey: 'EditProfile.PersonalChannel.Description',
        button: {langKey: 'EditProfile.PersonalChannel.Remove', isDanger: true}
      });
    } catch{
      return;
    }

    update(undefined);
  };

  return (
    <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-channel-title">
      <h2 id="vk-profile-channel-title" class="vk-block-title">Личный канал</h2>
      <Show
        when={props.channelId}
        fallback={
          <>
            <p class="vk-page-text vk-page-text-secondary">У вас пока нет личного канала.</p>
            <div class="vk-profile-actions">
              <button type="button" class="vk-button" disabled={busy()} onClick={pick}>Выбрать канал</button>
              <button type="button" class="vk-button vk-button-secondary" onClick={() => openWebKLeftTab('AppNewChannelTab', () => ({}))}>
                Создать канал
              </button>
            </div>
          </>
        }
      >
        <div class="vk-profile-channel">
          <AvatarNewTsx peerId={props.channelId.toPeerId(true)} size={48} />
          <div class="vk-profile-channel-info">
            <div class="vk-profile-channel-title">{channel()?.title}</div>
            <Show when={username()}>
              <div class="vk-page-text-secondary">@{username()}</div>
            </Show>
          </div>
        </div>
        <div class="vk-profile-actions">
          <button type="button" class="vk-button" onClick={() => openWebKChat(props.channelId.toPeerId(true))}>
            Открыть канал
          </button>
          <button type="button" class="vk-button vk-button-secondary" disabled={busy()} onClick={pick}>Сменить</button>
          <button type="button" class="vk-button vk-button-secondary" disabled={busy()} onClick={unlink}>Отвязать</button>
        </div>
      </Show>
    </section>
  );
}

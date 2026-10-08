import {createMemo, createSignal, Show} from 'solid-js';
import type {Chat} from '@layer';
import rootScope from '@lib/rootScope';
import {useChat} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import {toastNew} from '@components/toast';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {openWebKPopupTab} from '@/vkgram/webk';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {openVKChannelCreate} from '@/vkgram/pages/channel/VKChannelEditModal';
import VKChannelPickerModal from '@/vkgram/components/VKChannelPickerModal';

/**
 * Personal channel of «Моя страница». Data: `personal_channel_id` of the
 * full user + the channel from Web K's peer store. Actions: the same picker
 * and appProfileManager.updatePersonalChannel as Web K's edit profile tab;
 * creating a channel is Web K's own new-channel tab, in Web K's modal.
 * `bare` — content only, no block and no title of its own: «Настройки» holds
 * the piece inside its own headed item.
 */
export default function VKProfilePersonalChannel(props: {channelId?: ChatId, blockId?: string, bare?: boolean}) {
  const managers = rootScope.managers;
  const channel = useChat(() => props.channelId) as () => Chat.channel;
  const username = createMemo(() => getPeerActiveUsernames(channel())[0]);
  const [busy, setBusy] = createSignal(false);
  // the channels offered by the picker; the window is open while there are some
  const [pickerIds, setPickerIds] = createSignal<ChatId[]>();

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

  // only public channels you own can be personal (the list is Web K's own answer)
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

    setPickerIds(channelIds);
  };

  // the VKgram window «Новый канал» (name, description, the same `createChannel` call as Web K's
  // own tab); if it cannot be opened, Web K's «New Channel» tab in its popup takes its place
  const create = async() => {
    try {
      openVKChannelCreate();
    } catch(err) {
      console.error('VKgram: the new-channel window failed, falling back to Web K tab', err);
      try {
        await openWebKPopupTab('AppNewChannelTab', () => ({}));
      } catch(err2) {
        console.error('VKgram: Web K new-channel tab failed too', err2);
        toastNew({langPackKey: 'Error.AnError'});
      }
    }
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

  const content = (
    <>
      <Show
        when={props.channelId}
        fallback={
          <>
            <p class="vk-page-text vk-page-text-secondary">У вас пока нет личного канала.</p>
            <div class="vk-profile-actions">
              <button type="button" class="vk-button" disabled={busy()} onClick={pick}>Выбрать канал</button>
              <button type="button" class="vk-button vk-button-secondary" onClick={create}>
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
          <button type="button" class="vk-button" onClick={() => openVKChannelPage(props.channelId.toPeerId(true))}>
            Открыть канал
          </button>
          <button type="button" class="vk-button vk-button-secondary" disabled={busy()} onClick={pick}>Сменить</button>
          <button type="button" class="vk-button vk-button-secondary" disabled={busy()} onClick={unlink}>Отвязать</button>
        </div>
      </Show>

      <Show when={pickerIds()}>
        {(ids) => (
          <VKChannelPickerModal
            title="Выбор личного канала"
            channelIds={ids()}
            currentId={props.channelId}
            onSelect={(chatId) => {
              if(chatId !== props.channelId) update(chatId);
            }}
            onClose={() => setPickerIds(undefined)}
          />
        )}
      </Show>
    </>
  );

  if(props.bare) {
    return content;
  }

  return (
    <section class="vk-block vk-profile-section" aria-labelledby="vk-profile-channel-title" data-vk-home-block={props.blockId}>
      <h2 id="vk-profile-channel-title" class="vk-block-title">Личный канал</h2>
      {content}
    </section>
  );
}

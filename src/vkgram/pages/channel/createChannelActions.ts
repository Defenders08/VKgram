import {createResource, createSignal} from 'solid-js';
import type {ChatFull} from '@layer';
import rootScope from '@lib/rootScope';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {copyTextToClipboard} from '@helpers/clipboard';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {toast} from '@components/toast';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {closeVKChannel} from '@/vkgram/pages/channel/route';
import {openWebKChannelTab} from '@/vkgram/webk';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKChannelEdit} from '@/vkgram/pages/channel/VKChannelEditModal';
import {openVKGiftShop} from '@/vkgram/components/VKGiftShopModal';
import {openVKBoost} from '@/vkgram/components/VKBoostModal';
import {openVKReport} from '@/vkgram/components/VKReportModal';

/**
 * Everything a channel can be asked to do, in one place: the buttons and the ▼ list of
 * the channel page (`VKChannelActions`) call these. Every action is Web K's own — its managers and popups; VKgram only
 * decides where the buttons stand.
 */
export default function createChannelActions(peerId: PeerId) {
  const managers = rootScope.managers;
  const peers = usePeers();
  const fullPeer = useFullPeer(peerId) as () => ChatFull.channelFull | undefined;

  // * mute: Web K's answer (the channel's own settings, then the type defaults), asked again when they change
  const [notifyVersion, setNotifyVersion] = createSignal(0);
  createListenerSetter().add(rootScope)('dialog_notify_settings', (dialog) => {
    if(dialog.peerId === peerId) setNotifyVersion((version) => version + 1);
  });
  const [mutedResource] = createResource(notifyVersion, () => {
    return managers.appNotificationsManager.isPeerLocalMuted({peerId, respectType: true});
  });
  // `undefined` until it is known: the buttons stay out of the way until then
  const isMuted = () => mutedResource.latest === undefined ? undefined : !!mutedResource.latest;

  const toggleMute = async() => {
    const mute = !isMuted();
    try {
      await managers.appMessagesManager.togglePeerMute({peerId, mute});
    } catch(err) {
      console.error('VKgram: failed to toggle the mute', err);
      toast(mute ? 'Не удалось отключить уведомления' : 'Не удалось включить уведомления');
    }
  };

  // * rights: «Изменить» is for those who may change the channel's info, «Статистика» for those the server lets see it
  const [canEditResource] = createResource(() => {
    return managers.appChatsManager.hasRights(peerId.toChatId(), 'change_info');
  });
  const canEdit = () => !!canEditResource.latest;
  const canViewStats = () => !!fullPeer()?.pFlags?.can_view_stats;

  const edit = () => openVKChannelEdit(peerId);
  const openStatistics = () => openWebKChannelTab('statistics', peerId);

  // * subscription
  const isSubscribed = () => !(peers[peerId] as {pFlags?: {left?: boolean}})?.pFlags?.left;

  const join = async() => {
    try {
      await managers.appChatsManager.joinChannel(peerId.toChatId());
    } catch(err) {
      console.error('VKgram: joinChannel failed', err);
      toast('Не удалось подписаться на канал');
    }
  };

  const leave = async() => {
    const {default: confirmationPopup} = await import('@components/confirmationPopup');
    const button = {
      text: document.createTextNode('Покинуть'),
      isDanger: true
    };

    try {
      await confirmationPopup({
        title: 'Покинуть канал',
        descriptionRaw: 'Вы перестанете получать публикации этого канала.',
        button,
        // the cancel button is given here too, so it reads «Отмена» whatever Web K's language is
        buttons: [button, {text: document.createTextNode('Отмена'), isCancel: true}]
      });
    } catch{
      // «Отмена», Escape or a click outside — nothing to do
      return;
    }

    try {
      await managers.appChatsManager.leave(peerId.toChatId());
      closeVKChannel();
    } catch(err) {
      console.error('VKgram: failed to leave the channel', err);
      toast('Не удалось покинуть канал');
    }
  };

  // * discussion: the linked group, when there is one (its chat in VKgram's «Сообщения»)
  const discussionPeerId = () => {
    const id = fullPeer()?.linked_chat_id;
    return id ? id.toPeerId(true) : undefined;
  };

  const viewDiscussion = () => {
    const id = discussionPeerId();
    if(id) return openVKChat(id);
  };

  // * Web K's own flows
  const sendGift = () => openVKGiftShop(peerId);

  const boost = () => openVKBoost(peerId);

  // the report is made on the channel's latest publication, the way Web K reports a channel from its chat
  const report = async() => {
    const dialog = await managers.appMessagesManager.getDialogOnly(peerId);
    const mid = dialog?.top_message;
    if(!mid) {
      toast('В канале нет публикаций, на которые можно пожаловаться');
      return;
    }

    openVKReport(peerId, [mid]);
  };

  // * share: the public address of the channel
  const link = () => {
    const username = getPeerActiveUsernames(peers[peerId] as Parameters<typeof getPeerActiveUsernames>[0])[0];
    return username ? `https://t.me/${username}` : undefined;
  };

  const share = () => {
    const url = link();
    if(!url) {
      toast('У частного канала нет публичной ссылки');
      return;
    }
    copyTextToClipboard(url);
    toast('Ссылка на канал скопирована');
  };

  return {
    isMuted, toggleMute,
    canEdit, edit, canViewStats, openStatistics,
    isSubscribed, join, leave,
    discussionPeerId, viewDiscussion,
    sendGift, boost, report,
    link, share
  };
}

export type ChannelActions = ReturnType<typeof createChannelActions>;

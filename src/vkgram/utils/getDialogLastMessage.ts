import type {Message} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import type {Dialog, MyMessage} from '@appManagers/appMessagesManager';

/** What Web K's chat list shows as a dialog's last message */
export default function getDialogLastMessage(dialog: Dialog): MyMessage {
  let lastMessage = dialog.topMessage as MyMessage;
  if(lastMessage?.mid !== dialog.top_message) {
    const actual = apiManagerProxy.getMessageByPeer(dialog.peerId, dialog.top_message) as MyMessage;
    if(actual && (actual as Message.messageService).action?._ !== 'messageActionChannelJoined') {
      lastMessage = actual;
    }
  }

  return lastMessage;
}

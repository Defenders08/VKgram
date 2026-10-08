import {Accessor, createEffect, createMemo, onCleanup} from 'solid-js';
import type {Message} from '@layer';
import apiManagerProxy from '@lib/apiManagerProxy';
import wrapMessageForReply from '@components/wrappers/messageForReply';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import renderDialogSubtitleParts from '@components/wrappers/dialogSubtitle';
import {getMiddleware} from '@helpers/middleware';
import middlewarePromise from '@helpers/middlewarePromise';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import type {Dialog, MyMessage} from '@appManagers/appMessagesManager';

// what Web K's chat list shows as a dialog's last message
function getLastMessage(dialog: Dialog): MyMessage {
  let lastMessage = dialog.topMessage as MyMessage;
  if(lastMessage?.mid !== dialog.top_message) {
    const actual = apiManagerProxy.getMessageByPeer(dialog.peerId, dialog.top_message) as MyMessage;
    if(actual && (actual as Message.messageService).action?._ !== 'messageActionChannelJoined') {
      lastMessage = actual;
    }
  }

  return lastMessage;
}

/**
 * The last-message preview of a dialog, rendered by the same helper Web K's
 * chat list uses. Attach the returned ref to the element that shows it; the
 * text is re-rendered whenever the dialog (or its top message) changes, and a
 * superseded render is dropped through middleware.
 */
export default function createDialogPreview(dialog: Accessor<Dialog>) {
  const lastMessage = createMemo(() => getLastMessage(dialog()));
  const time = createMemo(() => {
    const message = lastMessage();
    return message ? formatDateAccordingToTodayNew(new Date(message.date * 1000)) : undefined;
  });

  let previewEl: HTMLSpanElement;
  createEffect(() => {
    const message = lastMessage();
    const peerId = dialog().peerId;

    const middlewareHelper = getMiddleware();
    onCleanup(() => middlewareHelper.destroy());
    // * the subtitle renderer awaits its "middleware" over every promise —
    // * a raw MiddlewareHelper's middleware is a () => boolean, not a wrapper
    const middleware = middlewarePromise(middlewareHelper.get());

    if(!previewEl) return;
    if(!message) {
      previewEl.replaceChildren();
      return;
    }

    renderDialogSubtitleParts({
      peerId,
      isSaved: false,
      lastMessage: message,
      middleware,
      textColor: 'secondary-text-color',
      messageRenderer: wrapMessageForReply,
      peerTitleRenderer: wrapPeerTitle
    }).then((parts) => {
      previewEl.replaceChildren(...parts);
    }, () => {
      // interrupted by a newer message — nothing to do
    });
  });

  return {
    lastMessage,
    time,
    /** the ref of the element the preview is rendered into */
    setRef: (el: HTMLSpanElement) => {
      previewEl = el;
    }
  };
}

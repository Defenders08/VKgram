import type {Message} from '@layer';
import MessageMedia from '@/vkgram/components/MessageMedia';

/**
 * Renders a single message's media attachment using the unified MessageMedia component.
 * Now a thin wrapper that delegates to MessageMedia.
 */
export default function VKChannelPostMedia(props: {
  message: Message.message,
  boxSize?: number,
  asFile?: boolean
}) {
  /**
   * Opens Web K's own media viewer (the one the chat and «Shared media» use) on
   * the message, with the same search context the chat gives it, so the viewer
   * pages through the channel's photos and videos by itself.
   */
  const handleMediaClick = async(message: Message.message, target?: HTMLElement) => {
    const {default: AppMediaViewer} = await import('@components/mediaViewer');
    new AppMediaViewer()
    .setSearchContext({
      peerId: message.peerId,
      inputFilter: {_: 'inputMessagesFilterPhotoVideo'},
      useSearch: true
    })
    .openMedia({message, target});
  };

  return (
    <MessageMedia
      message={props.message}
      boxSize={props.boxSize ?? 560}
      asFile={props.asFile}
      onMediaClick={handleMediaClick}
    />
  );
}

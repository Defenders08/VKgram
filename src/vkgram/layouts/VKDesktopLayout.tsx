import VKHeader from '@/vkgram/components/VKHeader';
import VKSidebar from '@/vkgram/components/VKSidebar';
import VKContent from '@/vkgram/components/VKContent';
import type {VKSectionId} from '@/vkgram/sections';

export type VKLayoutProps = {
  section: VKSectionId,
  onSectionChange: (id: VKSectionId) => void,
  // holder of the existing Web K messenger (`#page-chats`)
  messagesHost?: HTMLElement
};

/**
 * Desktop structure: header on top, left menu + content area below.
 */
export default function VKDesktopLayout(props: VKLayoutProps) {
  return (
    <div class="vk-desktop-layout">
      <VKHeader variant="desktop" />
      <div class="vk-desktop-main">
        <VKSidebar active={props.section} onSectionChange={props.onSectionChange} />
        <VKContent section={props.section} messagesHost={props.messagesHost} />
      </div>
    </div>
  );
}

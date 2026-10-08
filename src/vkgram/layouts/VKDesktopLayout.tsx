import {onCleanup, onMount} from 'solid-js';
import VKHeader from '@/vkgram/components/VKHeader';
import VKSidebar from '@/vkgram/components/VKSidebar';
import VKContent from '@/vkgram/components/VKContent';
import type {VKSectionId} from '@/vkgram/sections';
import pinColumns from '@/vkgram/utils/pinColumns';

export type VKLayoutProps = {
  section: VKSectionId,
  onSectionChange: (id: VKSectionId) => void,
  // holder of the existing Web K / Telegram (`#page-chats`)
  telegramHost?: HTMLElement
};

/**
 * Desktop structure: header on top, left menu + content area below.
 */
export default function VKDesktopLayout(props: VKLayoutProps) {
  let main: HTMLDivElement;

  onMount(() => onCleanup(pinColumns(main)));

  return (
    <div class="vk-desktop-layout">
      <VKHeader variant="desktop" section={props.section} />
      <div ref={main} class="vk-desktop-main">
        <VKSidebar active={props.section} onSectionChange={props.onSectionChange} withLogout />
        <VKContent section={props.section} telegramHost={props.telegramHost} />
      </div>
    </div>
  );
}

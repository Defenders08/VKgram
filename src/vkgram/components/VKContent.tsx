import {Component, Show} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import type {VKSectionId} from '@/vkgram/sections';
import VKPageMessages from '@/vkgram/pages/VKPageMessages';
import VKPageProfile from '@/vkgram/pages/VKPageProfile';
import VKPageNews from '@/vkgram/pages/VKPageNews';
import VKPageFriends from '@/vkgram/pages/VKPageFriends';
import VKPageGroups from '@/vkgram/pages/VKPageGroups';
import VKPageChannels from '@/vkgram/pages/VKPageChannels';
import VKPageSettings from '@/vkgram/pages/VKPageSettings';

// Sections mounted on demand. «Сообщения» isn't here: it stays mounted.
const PAGES: {[id in Exclude<VKSectionId, 'messages'>]: Component} = {
  profile: VKPageProfile,
  news: VKPageNews,
  friends: VKPageFriends,
  groups: VKPageGroups,
  channels: VKPageChannels,
  settings: VKPageSettings
};

/**
 * Main content area: shows the current section. Only this part changes on
 * navigation — header and sidebar / mobile nav stay as they are.
 */
export default function VKContent(props: {
  section: VKSectionId,
  // holder of the existing Web K messenger (`#page-chats`)
  messagesHost?: HTMLElement
}) {
  const page = () => props.section === 'messages' ? undefined : PAGES[props.section];

  return (
    <main class="vk-content">
      <VKPageMessages host={props.messagesHost} active={props.section === 'messages'} />
      <Show when={page()}>
        <Dynamic component={page()} />
      </Show>
    </main>
  );
}

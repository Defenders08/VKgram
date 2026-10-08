import {JSX, Show} from 'solid-js';
import VKIcon, {VKIconName} from '@/vkgram/components/VKIcons';

/**
 * The empty state of a VKgram page or list: a section icon, a short line and,
 * when there is something to say, a hint under it. One look for «nothing here
 * yet» and «not built yet».
 */
export default function VKEmptyState(props: {
  icon: VKIconName,
  title: string,
  description?: string,
  // an action under the text (a button)
  children?: JSX.Element
}) {
  return (
    <div class="vk-empty">
      <VKIcon name={props.icon} size={40} class="vk-empty-icon" />
      <p class="vk-empty-title">{props.title}</p>
      <Show when={props.description}>
        <p class="vk-page-text vk-page-text-secondary">{props.description}</p>
      </Show>
      {props.children}
    </div>
  );
}

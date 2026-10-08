import {FILE_ICON_MARKUP, VKFileKind} from '@/vkgram/utils/fileKind';

/**
 * The icon of a file type: a line glyph on the grid of the sidebar's own
 * icons (see VKIcons.tsx), stroked with `currentColor`. Used where a file has
 * no preview of its own.
 */
export default function VKFileIcon(props: {kind: VKFileKind, size?: number, class?: string}) {
  return (
    <svg
      class={props.class ?? 'vk-file-icon'}
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      innerHTML={FILE_ICON_MARKUP[props.kind]}
    />
  );
}

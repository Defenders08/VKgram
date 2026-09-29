import {getVKSection, VKSectionId} from '@/vkgram/sections';

/**
 * Temporary body of a VKgram section that isn't implemented yet.
 */
export default function VKPagePlaceholder(props: {
  section: VKSectionId,
  description: string
}) {
  const headingId = () => `vk-page-title-${props.section}`;

  return (
    <section class="vk-page" aria-labelledby={headingId()}>
      <div class="vk-block vk-page-block">
        <h1 id={headingId()} class="vk-page-title">{getVKSection(props.section).title}</h1>
        <p class="vk-page-text">{props.description}</p>
        <p class="vk-page-text vk-page-text-secondary">Раздел в разработке.</p>
      </div>
    </section>
  );
}

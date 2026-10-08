import {getVKSection, VKSectionId} from '@/vkgram/sections';
import VKEmptyState from '@/vkgram/components/VKEmptyState';

/**
 * Body of a VKgram section that has no page yet: the page frame, the title of
 * the section and an empty state with what the section is going to be. When a
 * section gets its page, its entry in `VKContent` points there instead — this
 * component stays for the sections still waiting.
 */
export default function VKPagePlaceholder(props: {
  section: VKSectionId,
  description: string
}) {
  const headingId = () => `vk-page-title-${props.section}`;
  const section = () => getVKSection(props.section);

  return (
    <section class="vk-page" aria-labelledby={headingId()}>
      <div class="vk-block vk-page-block">
        <h1 id={headingId()} class="vk-page-title">{section().title}</h1>
        <VKEmptyState icon={section().icon} title="Раздел в разработке" description={props.description} />
      </div>
    </section>
  );
}

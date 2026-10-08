import VKMediaPage, {VKMediaList} from '@/vkgram/components/VKMediaBrowser';

/**
 * «Видеозаписи»: «Поиск» — the videos of all chats (Telegram's global search,
 * videos only) and «Избранное» — the videos kept in the saved messages.
 */
export default function VKPageVideos() {
  return (
    <VKMediaPage
      section="videos"
      tabs={[
        {id: 'search', title: 'Поиск', searchPlaceholder: 'Поиск видеозаписей', render: (search) => <VKMediaList kind="videos" source="search" query={search.query} onQueryInput={search.onInput} />},
        {id: 'saved', title: 'Избранное', render: () => <VKMediaList kind="videos" source="saved" />}
      ]}
    />
  );
}

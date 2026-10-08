import VKMediaPage, {VKMediaList} from '@/vkgram/components/VKMediaBrowser';

/**
 * «Фотографии»: «Поиск» — the photos of all chats (Telegram's global search,
 * photos only) and «Избранное» — the photos kept in the saved messages.
 */
export default function VKPagePhotos() {
  return (
    <VKMediaPage
      section="photos"
      tabs={[
        {id: 'search', title: 'Поиск', searchPlaceholder: 'Поиск фотографий', render: (search) => <VKMediaList kind="photos" source="search" query={search.query} onQueryInput={search.onInput} />},
        {id: 'saved', title: 'Избранное', render: () => <VKMediaList kind="photos" source="saved" />}
      ]}
    />
  );
}

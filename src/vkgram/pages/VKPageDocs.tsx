import VKMediaPage, {VKMediaList} from '@/vkgram/components/VKMediaBrowser';

/**
 * «Документы»: «Поиск» — the files of all chats (Telegram's global search,
 * files only) and «Избранное» — the files kept in the saved messages.
 */
export default function VKPageDocs() {
  return (
    <VKMediaPage
      section="docs"
      tabs={[
        {id: 'search', title: 'Поиск', searchPlaceholder: 'Поиск файлов', render: (search) => <VKMediaList kind="docs" source="search" query={search.query} onQueryInput={search.onInput} />},
        {id: 'saved', title: 'Избранное', render: () => <VKMediaList kind="docs" source="saved" />}
      ]}
    />
  );
}

/**
 * The search input shared by the VKgram lists. Local filtering only — the
 * page decides what a query matches.
 */
export default function VKSearchField(props: {
  value: string,
  placeholder: string,
  onInput: (value: string) => void
}) {
  return (
    <input
      type="search"
      class="vk-search"
      value={props.value}
      placeholder={props.placeholder}
      aria-label={props.placeholder}
      autocomplete="off"
      onInput={(e) => props.onInput(e.currentTarget.value)}
    />
  );
}

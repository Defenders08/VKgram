import removeAccents from '@helpers/string/removeAccents';

const normalize = (text: string) => removeAccents(text).toLowerCase();

/**
 * Does `query` match the given name parts (names, titles, usernames)? Every
 * word of the query — with the leading `@` and the accents stripped — has to
 * be found somewhere in the parts. Shared by the VKgram searches, which all
 * filter what is already loaded.
 */
export default function matchesQuery(query: string, ...parts: (string | string[] | undefined)[]): boolean {
  const text = normalize(query.trim().replace(/^@/, ''));
  if(!text) return true;

  const haystack = normalize(parts.flat().filter(Boolean).join(' '));
  return text.split(/\s+/).every((word) => haystack.includes(word));
}

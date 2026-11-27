// lib/tags.ts
// Tags on records (db/migrations/2026-11-28_h_tags.sql): the same rules as the database, so a refusal is explained before saving.

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

export const cleanTag = (text: string): string => text.replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);

/** The list with a tag added; the same tag in other capitals is not added twice. Throws when the record is full. */
export function withTag(tags: string[], text: string): string[] {
  const tag = cleanTag(text);
  if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return tags;
  if (tags.length >= MAX_TAGS) throw new Error(`A record can have ${MAX_TAGS} tags at most.`);
  return [...tags, tag];
}

export const withoutTag = (tags: string[], tag: string): string[] => tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());

/** Every tag in use, once each (first spelling wins), in alphabetical order. */
export function tagsInUse(records: { tags?: string[] | null }[]): string[] {
  const seen = new Map<string, string>();
  for (const r of records) for (const t of r.tags || []) if (!seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

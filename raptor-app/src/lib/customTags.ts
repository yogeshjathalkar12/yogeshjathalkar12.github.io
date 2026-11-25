// lib/customTags.ts
// Custom fields as merge tags in the CRM email and text templates: {{company.employees}}, {{contact.segment}}, {{deal.budget_inr}}.
// The database fills them in when the message is made (db/migrations/2026-11-25_crm_custom_field_tags.sql); the slug rule here is the
// same as crm_tag_slug there: the field's name in lower case, every run of other characters turned into one _.

import type { CustomFieldDef, CustomFieldEntity } from './customFields.ts';

export const tagSlug = (name: string): string => String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export interface CustomTag { tag: string; label: string; entity: CustomFieldEntity }

const ENTITY_WORD: Record<CustomFieldEntity, string> = { company: 'company', contact: 'person', deal: 'deal' };

/** The tags for these fields, in the order of the fields; when two fields give the same tag the first one is kept (as in the database). */
export function customTags(defs: CustomFieldDef[]): CustomTag[] {
  const seen = new Set<string>();
  const out: CustomTag[] = [];
  const ordered = [...defs].sort((a, b) => (a.sort_order - b.sort_order) || String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const d of ordered) {
    const slug = tagSlug(d.name);
    if (!slug) continue;
    const tag = `${d.entity_type}.${slug}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push({ tag, label: `${d.name} (${ENTITY_WORD[d.entity_type]})`, entity: d.entity_type });
  }
  return out;
}

/** Fill a template for a PREVIEW: the given sample values for known tags, "[Field name]" for a custom tag, nothing for anything else. */
export function previewFill(text: string, samples: Record<string, string>, tags: CustomTag[]): string {
  const byTag = new Map(tags.map((t) => [t.tag, t]));
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    if (key in samples) return samples[key];
    const t = byTag.get(key);
    return t ? `[${t.label.replace(/ \((company|person|deal)\)$/, '')}]` : '';
  });
}

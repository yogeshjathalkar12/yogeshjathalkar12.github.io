// A competitor's battle card: its statements with where each was found, what the team has confirmed or changed, what the AI would change,
// and the team's own answers. Used by the web and the PC screens (cloud table competitors).

export interface Source { url: string; quote: string; checked_at?: string }
export interface Play { when: string; say: string }
export interface Competitor {
  id: string; name: string; url: string; what_they_sell: string; target_customer: string; pricing_model: string;
  strengths: string[] | null; weaknesses: string[] | null; positioning: string; how_to_beat_them: string[] | null; updated_at?: string;
  aliases?: string[] | null; archived?: boolean; watch?: Record<string, unknown>; sources?: Record<string, Source> | null;
  confirmed?: Record<string, { by: string; at: string }> | null; proposed?: Record<string, unknown> | null; playbook?: Play[] | null; analysed_at?: string | null;
}
export type CardField = 'what_they_sell' | 'target_customer' | 'pricing_model' | 'positioning' | 'strengths' | 'weaknesses' | 'how_to_beat_them';

export const FIELDS: { key: CardField; label: string; list: boolean; judgement: boolean }[] = [
  { key: 'what_they_sell', label: 'What they sell', list: false, judgement: false },
  { key: 'target_customer', label: 'Who they sell to', list: false, judgement: false },
  { key: 'pricing_model', label: 'How they charge', list: false, judgement: false },
  { key: 'positioning', label: 'How they describe themselves', list: false, judgement: false },
  { key: 'strengths', label: 'Their strengths', list: true, judgement: true },
  { key: 'weaknesses', label: 'Their weaknesses', list: true, judgement: true },
  { key: 'how_to_beat_them', label: 'How to beat them', list: true, judgement: true },
];

export type Origin = 'confirmed' | 'source' | 'suggestion';
export interface Statement { text: string; origin: Origin; source: Source | null }
export interface Block { key: CardField; label: string; list: boolean; confirmedBy: string; statements: Statement[] }

const asList = (value: unknown): string[] => (Array.isArray(value) ? value : value ? [value] : [])
  .filter((v): v is string => typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'unknown');

const safeLink = (source: Source | undefined | null): Source | null => (source && /^https?:\/\//i.test(source.url || '') ? source : null);

/** The card ready to show. Every statement says where it comes from: a person, a line on their pages, or only the AI. */
export function blocks(c: Competitor): Block[] {
  return FIELDS.map((f) => {
    const confirmed = c.confirmed?.[f.key];
    return {
      key: f.key, label: f.label, list: f.list, confirmedBy: confirmed?.by || '',
      statements: asList((c as any)[f.key]).map((text): Statement => {
        const source = safeLink(c.sources?.[text]);
        return { text, source, origin: confirmed ? 'confirmed' : source ? 'source' : 'suggestion' };
      }),
    };
  }).filter((b) => b.statements.length > 0);
}

export const ORIGIN_LABELS: Record<Origin, string> = { confirmed: 'Confirmed by your team', source: 'On their pages', suggestion: 'AI suggestion, check it' };

export interface Proposal { key: CardField; label: string; current: string[]; proposed: string[] }
export const proposals = (c: Competitor): Proposal[] => FIELDS.filter((f) => c.proposed && f.key in c.proposed)
  .map((f) => ({ key: f.key, label: f.label, current: asList((c as any)[f.key]), proposed: asList(c.proposed![f.key]) }));

export const draftOf = (c: Competitor): Record<CardField, string> =>
  Object.fromEntries(FIELDS.map((f) => [f.key, asList((c as any)[f.key]).join('\n')])) as Record<CardField, string>;

const tidy = (text: string, limit: number) => text.replace(/\s+/g, ' ').trim().slice(0, limit);

/** Only what the person actually changed, ready for competitor_edit(); {} when nothing changed. */
export function changesOf(c: Competitor, draft: Record<CardField, string>): Record<string, unknown> {
  const before = draftOf(c);
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (draft[f.key].trim() === before[f.key].trim()) continue;
    out[f.key] = f.list ? draft[f.key].split('\n').map((l) => tidy(l, 500)).filter(Boolean).slice(0, 20) : tidy(draft[f.key], 2000);
  }
  return out;
}

export const cleanPlaybook = (rows: Play[]): Play[] => rows.map((r) => ({ when: tidy(r.when || '', 200), say: tidy(r.say || '', 600) })).filter((r) => r.say).slice(0, 50);

export function cleanAliases(text: string, name = ''): string[] {
  const seen = new Set([name.trim().toLowerCase()]);
  return text.split(/[,\n;]+/).map((a) => tidy(a, 80)).filter((a) => {
    const key = a.toLowerCase();
    if (a.length < 2 || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

export function checkNew(name: string, url: string, existing: Pick<Competitor, 'name'>[]): { error: string } | { name: string; url: string } {
  const clean = tidy(name, 200);
  let address = url.trim();
  if (address && !/^[a-z]+:\/\//i.test(address)) address = `https://${address}`;
  if (!clean) return { error: 'Enter the competitor’s name.' };
  if (existing.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return { error: 'This competitor is already on the list.' };
  let parsed: URL;
  try { parsed = new URL(address); } catch { return { error: 'Enter their website, for example acme.com' }; }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|0\.)|\.local$/i.test(parsed.hostname)) return { error: 'Enter their public website, for example acme.com' };
  return { name: clean, url: parsed.href };
}

// lib/scoring.ts
// Lead scoring (db/migrations/2026-11-28_i_lead_scoring.sql): each rule that matches a contact adds its points. Worked out when shown.

export type ScoreOp = 'is' | 'contains' | 'filled' | 'empty' | 'over' | 'under';
export interface ScoreRule { id: string; field: string; op: ScoreOp; value: string; points: number }

export const SCORE_FIELDS: { id: string; label: string; kind: 'text' | 'number' | 'tags' }[] = [
  { id: 'status', label: 'Status', kind: 'text' },
  { id: 'job_title', label: 'Job title', kind: 'text' },
  { id: 'email', label: 'Email', kind: 'text' },
  { id: 'phone', label: 'Phone', kind: 'text' },
  { id: 'company', label: 'Company', kind: 'text' },
  { id: 'tags', label: 'Tags', kind: 'tags' },
  { id: 'days_since_contact', label: 'Days since last contact', kind: 'number' },
];

export const OPS: Record<'text' | 'number' | 'tags', [ScoreOp, string][]> = {
  text: [['contains', 'contains'], ['is', 'is'], ['filled', 'is filled in'], ['empty', 'is empty']],
  tags: [['is', 'include'], ['filled', 'are set'], ['empty', 'are empty']],
  number: [['over', 'is more than'], ['under', 'is less than'], ['empty', 'is unknown (never contacted)']],
};

export const fieldKind = (field: string): 'text' | 'number' | 'tags' => SCORE_FIELDS.find((f) => f.id === field)?.kind ?? 'text';
export const needsValue = (op: ScoreOp): boolean => op !== 'filled' && op !== 'empty';

function read(contact: any, field: string, now: number): string | number | string[] | null {
  if (field === 'company') return contact.companies?.name ?? null;
  if (field === 'tags') return contact.tags ?? [];
  if (field === 'days_since_contact') {
    const at = Date.parse(contact.last_interaction_at || '');
    return Number.isFinite(at) ? Math.floor((now - at) / 86_400_000) : null;
  }
  if (field.startsWith('cf:')) return contact.custom_fields?.[field.slice(3)] ?? null;
  return contact[field] ?? null;
}

export function ruleMatches(contact: any, rule: ScoreRule, now: number = Date.now()): boolean {
  const found = read(contact, rule.field, now);
  const empty = found === null || found === '' || (Array.isArray(found) && found.length === 0);
  if (rule.op === 'empty') return empty;
  if (rule.op === 'filled') return !empty;
  if (empty) return false;
  const wanted = rule.value.trim().toLowerCase();
  if (!wanted) return false;
  if (rule.op === 'over' || rule.op === 'under') {
    const a = Number(found), b = Number(wanted);
    return Number.isFinite(a) && Number.isFinite(b) && (rule.op === 'over' ? a > b : a < b);
  }
  if (Array.isArray(found)) return found.some((t) => t.toLowerCase() === wanted);
  const text = String(found).toLowerCase();
  return rule.op === 'is' ? text === wanted : text.includes(wanted);
}

export function scoreContact(contact: any, rules: ScoreRule[], now: number = Date.now()): number {
  return rules.reduce((sum, rule) => sum + (ruleMatches(contact, rule, now) ? rule.points : 0), 0);
}

export function describeRule(rule: ScoreRule, fieldLabel: string): string {
  const op = OPS[fieldKind(rule.field)].find(([id]) => id === rule.op)?.[1] ?? rule.op;
  return `${rule.points > 0 ? '+' : ''}${rule.points} when ${fieldLabel.toLowerCase()} ${op}${needsValue(rule.op) ? ` "${rule.value}"` : ''}`;
}

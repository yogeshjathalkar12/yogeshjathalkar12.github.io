// Changes to the CRM worth making after a call. Each is only a suggestion with its reason: nothing is changed until a person approves it,
// and a deal is never moved to won or lost from here.
import { findIn, tokens } from './calls/words.ts';
import { linesOf } from './calls/trackers.ts';
import { OBJECTION_NAMES, type Measures } from './calls/measuresView.ts';
import type { Writeup } from './calls/writeupView.ts';

export interface SuggestCall {
  id: string; company_name: string; contact_id?: string | null; deal_id?: string | null; started_at: string;
  writeup?: Writeup | null; metrics?: Measures | null; segments?: Array<{ who?: string; at?: number | null; text?: string }> | null; transcript?: string | null;
}
export interface SuggestDeal { id: string; stage: string; competitors?: string[] | null }
export interface SuggestStage { key: string; label: string; type: 'open' | 'won' | 'lost'; sort_order: number; pipeline_id?: string | null }
export interface SuggestTask { title: string; notes?: string | null; deal_id?: string | null; contact_id?: string | null }
export interface Rival { name: string; aliases?: string[] | null }

export type Suggestion =
  | { key: string; kind: 'task'; label: string; why: string; line: number | null; title: string; notes: string }
  | { key: string; kind: 'stage'; label: string; why: string; line: number | null; stage: string }
  | { key: string; kind: 'competitors'; label: string; why: string; line: number | null; competitors: string[] };

const clip = (text: string, length: number) => (text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text);
const same = (a: string, b: string) => tokens(a).join(' ') === tokens(b).join(' ');

export function suggestionsFor(call: SuggestCall, context: { deal?: SuggestDeal | null; stages?: SuggestStage[]; tasks?: SuggestTask[]; rivals?: Rival[] } = {}): Suggestion[] {
  const out: Suggestion[] = [];
  const lines = linesOf(call);
  const company = call.company_name || 'Unknown';
  const day = new Date(call.started_at).toLocaleDateString();
  // a task already added for this call is not suggested again
  const taken = (title: string) => (context.tasks || []).some((t) => same(t.title, title));
  const task = (key: string, text: string, why: string, line: number | null, quote: string) => {
    const title = clip(`${company}: ${text}`, 200);
    if (!taken(title)) out.push({ key, kind: 'task', label: `Add a task: ${text}`, why, line, title, notes: `From the call of ${day}${quote ? `: "${quote}"` : ''}` });
  };

  const step = call.writeup?.agreed_step;
  if (step) task('step', step.text, 'A next step was agreed on the call.', step.line, step.quote);
  (call.writeup?.promises || []).filter((p) => p.by === 'us' && !(step && same(p.text, step.text))).slice(0, 5)
    .forEach((p, i) => task(`promise:${i}`, p.text, 'We said we would do this.', p.line, p.quote));
  (call.writeup?.open_questions || []).slice(0, 3).forEach((q, i) => task(`question:${i}`, `Answer: ${q.text}`, 'This question was left open.', q.line, q.quote));

  const unanswered = (call.metrics?.objections || []).filter((o) => o.acknowledged === false);
  const seen = new Set<string>();
  for (const o of unanswered) {
    if (seen.has(o.kind)) continue;
    seen.add(o.kind);
    const name = (OBJECTION_NAMES[o.kind] || o.kind).toLowerCase();
    task(`concern:${o.kind}`, `Answer their concern (${name})`, 'This concern was not answered during the call.', o.line, lines[o.line]?.text || '');
  }

  const deal = context.deal;
  if (deal) {
    const stages = context.stages || [];
    const here = stages.find((s) => s.key === deal.stage);
    if (here && here.type === 'open' && (step || call.metrics?.next_step?.mentioned)) {
      const row = stages.filter((s) => (s.pipeline_id || '') === (here.pipeline_id || '')).sort((a, b) => a.sort_order - b.sort_order);
      const next = row[row.findIndex((s) => s.key === here.key) + 1];
      // only offered from the very first stage: later moves depend on things a call alone cannot show
      if (next && next.type === 'open' && row.find((s) => s.type === 'open')?.key === here.key) {
        out.push({ key: 'stage', kind: 'stage', label: `Move the deal from ${here.label} to ${next.label}`, why: 'A next step came out of the first conversation. Automations set for that stage will run.', line: step?.line ?? call.metrics?.next_step?.line ?? null, stage: next.key });
      }
    }
    const known = (deal.competitors || []).map((c) => tokens(c).join(' '));
    const found: Array<{ name: string; line: number }> = [];
    for (const rival of context.rivals || []) {
      const names = [rival.name, ...(rival.aliases || [])].filter((n) => n && n.trim().length > 1);
      if (names.some((n) => known.includes(tokens(n).join(' ')))) continue;
      const line = lines.findIndex((l) => l.who !== 'You' && names.some((n) => findIn(tokens(l.text), n) >= 0));
      if (line >= 0) found.push({ name: rival.name, line });
    }
    if (found.length) {
      out.push({ key: 'competitors', kind: 'competitors', label: `Record ${found.map((f) => f.name).join(', ')} as a competitor on the deal`, why: 'Named by the other side on the call.', line: found[0].line, competitors: [...(deal.competitors || []), ...found.map((f) => f.name)] });
    }
  }
  return out;
}

// Numbers about a team's calls: per person and per week, the concerns heard most, and how calls differ between deals won and lost.
// Everything is counted from the measures saved with each call; a figure nobody could measure is left out of the average, and the number of
// calls behind every figure is returned with it.
import type { Measures } from './measuresView.ts';
import { OBJECTION_NAMES } from './measuresView.ts';

export interface TeamCall {
  id: string; created_by: string | null; started_at: string; duration_seconds: number | null; deal_id?: string | null;
  metrics?: Measures | null;
}

export interface Figures {
  calls: number;
  minutes: number;
  measured: number;                 // calls with measures
  talkShare: number | null;         // average, 0..1
  talkShareFrom: number;
  questions: number | null;         // average per call
  questionsFrom: number;
  nextStepRate: number | null;      // 0..1
  nextStepFrom: number;
  acknowledged: number | null;      // 0..1 of concerns that could be judged
  concerns: number;
  longestMonologue: number | null;  // average seconds
}

export const MIN_GROUP = 10;        // calls needed in each group before won and lost are compared

const mean = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const some = <T,>(list: Array<T | null | undefined>) => list.filter((v): v is T => v !== null && v !== undefined);

export function figures(calls: TeamCall[]): Figures {
  const measures = some(calls.map((c) => c.metrics));
  const shares = some(measures.map((m) => m.talk?.rep_share));
  const questions = some(measures.map((m) => m.questions?.count));
  const steps = some(measures.map((m) => m.next_step?.mentioned));
  const judged = measures.flatMap((m) => (m.objections || []).filter((o) => o.acknowledged !== null));
  const long = some(measures.map((m) => m.longest_monologue?.seconds));
  return {
    calls: calls.length,
    minutes: Math.round(calls.reduce((a, c) => a + (c.duration_seconds || 0), 0) / 60),
    measured: measures.length,
    talkShare: mean(shares), talkShareFrom: shares.length,
    questions: mean(questions), questionsFrom: questions.length,
    nextStepRate: steps.length ? steps.filter(Boolean).length / steps.length : null, nextStepFrom: steps.length,
    acknowledged: judged.length ? judged.filter((o) => o.acknowledged).length / judged.length : null,
    concerns: measures.reduce((a, m) => a + (m.objections || []).length, 0),
    longestMonologue: mean(long),
  };
}

/** One row of figures per person, busiest first. */
export function byPerson(calls: TeamCall[]): Array<{ person: string; figures: Figures }> {
  const groups = new Map<string, TeamCall[]>();
  for (const c of calls) {
    const key = c.created_by || '';
    groups.set(key, [...(groups.get(key) || []), c]);
  }
  return [...groups.entries()].map(([person, list]) => ({ person, figures: figures(list) })).sort((a, b) => b.figures.calls - a.figures.calls);
}

/** The Monday of the week a call started, as "2026-11-23", in the reader's own time. */
export function weekOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The last `weeks` weeks up to `now`, oldest first, weeks without calls included. */
export function byWeek(calls: TeamCall[], weeks = 8, now = new Date()): Array<{ week: string; figures: Figures }> {
  const keys: string[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - 7 * i);
    keys.push(weekOf(d.toISOString()));
  }
  return keys.map((week) => ({ week, figures: figures(calls.filter((c) => weekOf(c.started_at) === week)) }));
}

/** The concerns heard, most frequent first, with how often they were acknowledged before being answered. */
export function concernRanking(calls: TeamCall[]) {
  const found = new Map<string, { count: number; calls: Set<string>; judged: number; acknowledged: number }>();
  for (const call of calls) {
    for (const o of call.metrics?.objections || []) {
      const row = found.get(o.kind) || { count: 0, calls: new Set<string>(), judged: 0, acknowledged: 0 };
      row.count += 1;
      row.calls.add(call.id);
      if (o.acknowledged !== null) {
        row.judged += 1;
        if (o.acknowledged) row.acknowledged += 1;
      }
      found.set(o.kind, row);
    }
  }
  return [...found.entries()]
    .map(([kind, r]) => ({ kind, name: OBJECTION_NAMES[kind] || kind, count: r.count, calls: r.calls.size, acknowledged: r.judged ? r.acknowledged / r.judged : null }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Calls on deals that were won against calls on deals that were lost. Compared only when each side has enough calls. */
export function wonAgainstLost(calls: TeamCall[], outcomeOf: (dealId: string) => 'won' | 'lost' | 'open' | undefined) {
  const side = (outcome: 'won' | 'lost') => calls.filter((c) => c.deal_id && c.metrics && outcomeOf(c.deal_id) === outcome);
  const won = side('won');
  const lost = side('lost');
  if (won.length < MIN_GROUP || lost.length < MIN_GROUP) return { enough: false as const, wonCalls: won.length, lostCalls: lost.length };
  return { enough: true as const, wonCalls: won.length, lostCalls: lost.length, won: figures(won), lost: figures(lost) };
}

// Which open deals need a person's attention, and why. Counted from what is already saved (the deal, its tasks, its history and its calls):
// nothing is guessed, no score is made up, and every warning says what it saw.
import { findIn, tokens } from './calls/words.ts';
import { linesOf } from './calls/trackers.ts';
import { OBJECTION_NAMES, type Measures } from './calls/measuresView.ts';

export const QUIET_DAYS = 14;
export const VERY_QUIET_DAYS = 30;
export const RECENT_CALL_DAYS = 30;

export interface WarnDeal {
  id: string; title: string; stage: string; value?: number | null; contact_id?: string | null; company_id?: string | null;
  created_at: string; expected_close?: string | null; meeting_at?: string | null; deleted_at?: string | null; assignee_id?: string | null;
}
export interface WarnStage { key: string; type: 'open' | 'won' | 'lost' }
export interface WarnTask { deal_id?: string | null; contact_id?: string | null; title: string; due_at?: string | null; done_at?: string | null }
export interface WarnTouch { deal_id?: string | null; contact_id?: string | null; created_at: string }
export interface WarnCall {
  id: string; deal_id?: string | null; contact_id?: string | null; started_at: string; metrics?: Measures | null;
  segments?: Array<{ who?: string; at?: number | null; text?: string }> | null; transcript?: string | null;
}
export interface WarnRival { name: string; aliases?: string[] | null }

export type WarningKind = 'close_passed' | 'task_overdue' | 'quiet' | 'no_next_step' | 'concern' | 'competitor';
export interface Warning { kind: WarningKind; level: 1 | 2 | 3; text: string; callId?: string; line?: number }
export interface DealAttention { deal: WarnDeal; warnings: Warning[]; weight: number; lastTouch: string | null }

const DAY = 86400000;
const ago = (days: number) => (days === 1 ? '1 day' : `${days} days`);

export function isOpen(deal: WarnDeal, stages: WarnStage[]): boolean {
  if (deal.deleted_at) return false;
  const stage = stages.find((s) => s.key === deal.stage);
  return stage ? stage.type === 'open' : deal.stage !== 'won' && deal.stage !== 'lost';
}

const newest = (dates: Array<string | null | undefined>, now: number) => {
  let best = 0;
  for (const d of dates) {
    const t = d ? Date.parse(d) : NaN;
    if (!Number.isNaN(t) && t <= now && t > best) best = t;
  }
  return best;
};

export function warningsFor(deal: WarnDeal, data: { tasks: WarnTask[]; touches: WarnTouch[]; calls: WarnCall[]; rivals?: WarnRival[]; dealsOfContact?: number }, now: Date = new Date()): { warnings: Warning[]; lastTouch: string | null } {
  const at = now.getTime();
  // history that names only the person counts for a deal when that person has just this one open deal
  const own = <T extends { deal_id?: string | null; contact_id?: string | null }>(rows: T[]) => rows.filter((r) => r.deal_id === deal.id
    || (!r.deal_id && !!deal.contact_id && r.contact_id === deal.contact_id && (data.dealsOfContact ?? 1) <= 1));
  const tasks = own(data.tasks);
  const calls = own(data.calls).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const open = tasks.filter((t) => !t.done_at);
  const warnings: Warning[] = [];

  if (deal.expected_close) {
    const close = Date.parse(`${deal.expected_close}T23:59:59`);
    if (close < at) warnings.push({ kind: 'close_passed', level: 3, text: `The expected close date passed ${ago(Math.max(1, Math.floor((at - close) / DAY) + 1))} ago.` });
  }
  const late = open.filter((t) => t.due_at && Date.parse(t.due_at) < at);
  if (late.length) {
    const first = [...late].sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))[0];
    warnings.push({ kind: 'task_overdue', level: 2, text: late.length === 1 ? `A task is overdue: ${first.title}` : `${late.length} tasks are overdue, the oldest: ${first.title}` });
  }
  const ahead = (deal.meeting_at && Date.parse(deal.meeting_at) > at) || open.some((t) => t.due_at && Date.parse(t.due_at) >= at);
  const touch = newest([deal.created_at, deal.meeting_at, ...own(data.touches).map((t) => t.created_at), ...calls.map((c) => c.started_at), ...tasks.map((t) => t.done_at)], at);
  const quiet = touch ? Math.floor((at - touch) / DAY) : 0;
  if (!ahead && quiet >= QUIET_DAYS) warnings.push({ kind: 'quiet', level: quiet >= VERY_QUIET_DAYS ? 3 : 2, text: `Nothing has happened for ${ago(quiet)} and nothing is planned.` });

  const last = calls[0];
  if (last && at - Date.parse(last.started_at) <= RECENT_CALL_DAYS * DAY) {
    const m = last.metrics;
    if (!ahead && m?.next_step && !m.next_step.mentioned) warnings.push({ kind: 'no_next_step', level: 2, text: 'The last call ended without a next step, and nothing is planned.', callId: last.id });
    const unanswered = (m?.objections || []).filter((o) => o.acknowledged === false);
    if (unanswered.length) {
      const names = [...new Set(unanswered.map((o) => (OBJECTION_NAMES[o.kind] || o.kind).toLowerCase()))];
      warnings.push({ kind: 'concern', level: 2, text: `A concern in the last call was not answered: ${names.join(', ')}.`, callId: last.id, line: unanswered[0].line });
    }
  }
  const recent = calls.filter((c) => at - Date.parse(c.started_at) <= RECENT_CALL_DAYS * DAY);
  for (const rival of data.rivals || []) {
    const names = [rival.name, ...(rival.aliases || [])].filter((n) => n && n.trim().length > 1);
    let found: { callId: string; line: number } | null = null;
    for (const call of recent) {
      const line = linesOf(call).findIndex((l) => l.who !== 'You' && names.some((n) => findIn(tokens(l.text), n) >= 0));
      if (line >= 0) { found = { callId: call.id, line }; break; }
    }
    if (found) warnings.push({ kind: 'competitor', level: 1, text: `${rival.name} was mentioned by the other side in a call.`, ...found });
  }
  warnings.sort((a, b) => b.level - a.level);
  return { warnings, lastTouch: touch ? new Date(touch).toISOString() : null };
}

/** Every open deal that has something to attend to: the most pressing first, larger deals first among equals. */
export function dealsNeedingAttention(deals: WarnDeal[], stages: WarnStage[], data: { tasks: WarnTask[]; touches: WarnTouch[]; calls: WarnCall[]; rivals?: WarnRival[] }, now: Date = new Date()): DealAttention[] {
  const open = deals.filter((d) => isOpen(d, stages));
  const perContact = new Map<string, number>();
  for (const d of open) if (d.contact_id) perContact.set(d.contact_id, (perContact.get(d.contact_id) || 0) + 1);
  // grouped once, so thousands of deals stay quick
  const group = <T extends { deal_id?: string | null; contact_id?: string | null }>(rows: T[]) => {
    const byDeal = new Map<string, T[]>();
    const byContact = new Map<string, T[]>();
    for (const r of rows) {
      const map = r.deal_id ? byDeal : byContact;
      const key = r.deal_id || r.contact_id;
      if (!key) continue;
      const list = map.get(key);
      if (list) list.push(r); else map.set(key, [r]);
    }
    return (d: WarnDeal) => [...(byDeal.get(d.id) || []), ...(d.contact_id ? byContact.get(d.contact_id) || [] : [])];
  };
  const tasks = group(data.tasks);
  const touches = group(data.touches);
  const calls = group(data.calls);
  return open.map((deal) => {
    const found = warningsFor(deal, { tasks: tasks(deal), touches: touches(deal), calls: calls(deal), rivals: data.rivals, dealsOfContact: deal.contact_id ? perContact.get(deal.contact_id) : 0 }, now);
    return { deal, warnings: found.warnings, lastTouch: found.lastTouch, weight: found.warnings.reduce((sum, w) => sum + w.level, 0) };
  }).filter((r) => r.warnings.length)
    .sort((a, b) => (b.warnings[0].level - a.warnings[0].level) || (b.weight - a.weight) || (Number(b.deal.value || 0) - Number(a.deal.value || 0)));
}

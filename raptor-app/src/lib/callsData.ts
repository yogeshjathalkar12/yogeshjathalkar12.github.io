// Reading and writing calls for the web screens. Calls are made and written up by the PC app; the web shows them to whoever the database
// lets see them. Every part that needs a database update the owner has not run yet fails softly.
import { supabase } from './supabaseClient';
import { selectAll } from './selectAll';
import { isNotInstalled } from './dbMissing';
import { hitsFor, linesOf, type Tracker } from './calls/trackers';
import type { Measures } from './calls/measuresView';
import type { Writeup } from './calls/writeupView';
import type { Scorecard, Answer } from './calls/scoring';

export interface CallRow {
  id: string; company_name: string; contact_id: string | null; deal_id?: string | null; started_at: string; duration_seconds: number | null;
  sentiment: string; summary: string; next_steps?: string; created_by: string | null; capture?: string | null; labels?: string | null;
  metrics?: Measures | null; writeup?: Writeup | null; objections?: string[]; buying_signals?: string[]; recorded?: boolean;
  transcript?: string; segments?: Array<{ who: string; at: number | null; seconds?: number; text: string; lang?: string }> | null;
}
export interface Comment { id: string; call_id: string; line: number | null; body: string; created_by: string | null; created_at: string }
export interface Score { id: string; call_id: string; scorecard_id: string; answers: Record<string, Answer>; score: number | null; note: string | null; created_by: string | null; created_at: string }
export interface Clip { id: string; call_id: string | null; title: string; note: string | null; topic: string; company_name: string; lines: Array<{ who: string; text: string; at: number | null }>; created_by: string | null; created_at: string }

const BASE = 'id, company_name, contact_id, started_at, duration_seconds, sentiment, summary, created_by, objections, buying_signals';
const FULL = `${BASE}, deal_id, capture, labels, metrics, writeup, recorded`;

export interface CallQuery { days: number; person: string; search: string; sentiment: string; tracker: Tracker | null }

/** Characters that have a meaning inside the database's "any of these" filter are left out of what the person typed. */
export const safeTerm = (text: string) => text.replace(/[,()%*\\"]/g, ' ').replace(/\s+/g, ' ').trim();

export async function loadCalls(q: CallQuery): Promise<{ rows: CallRow[]; basic: boolean }> {
  const since = q.days ? new Date(Date.now() - q.days * 86400000).toISOString() : '';
  const build = (columns: string) => () => {
    let query: any = supabase.from('calls').select(columns);
    if (since) query = query.gte('started_at', since);
    if (q.person) query = query.eq('created_by', q.person);
    if (q.sentiment) query = query.eq('sentiment', q.sentiment);
    const term = safeTerm(q.search);
    if (term) query = query.or(`company_name.ilike.%${term}%,summary.ilike.%${term}%,transcript.ilike.%${term}%`);
    if (q.tracker) {
      const wanted = q.tracker.phrases.map(safeTerm).filter(Boolean);
      if (wanted.length) query = query.or(wanted.map((p) => `transcript.ilike.%${p}%`).join(','));
    }
    return query.order('started_at', { ascending: false });
  };
  // a watch word is checked word by word here: the database only narrows the list down
  const extra = q.tracker ? ', transcript' : '';
  let basic = false;
  let result = await selectAll<CallRow>(build(FULL + extra + (q.tracker ? ', segments' : '')));
  if (result.error && isNotInstalled(result.error)) {
    basic = true;
    result = await selectAll<CallRow>(build(BASE + extra));
  }
  if (result.error) throw result.error;
  let rows = result.data || [];
  if (q.tracker) {
    const tracker = q.tracker;
    rows = rows.filter((r) => hitsFor(linesOf(r), tracker).count > 0).map(({ transcript, segments, ...rest }) => rest as CallRow);
  }
  rows.sort((a, b) => b.started_at.localeCompare(a.started_at));
  return { rows, basic };
}

/** Everything the "ask" page needs to search: the calls of the period with their measures and words. `days` 0 means all of them. */
export async function loadCallsForAsk(days: number): Promise<{ rows: CallRow[]; basic: boolean }> {
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : '';
  const build = (columns: string) => () => {
    let query: any = supabase.from('calls').select(columns);
    if (since) query = query.gte('started_at', since);
    return query.order('started_at', { ascending: false });
  };
  let basic = false;
  let result = await selectAll<CallRow>(build('id, company_name, started_at, metrics, segments, transcript'));
  if (result.error && isNotInstalled(result.error)) {
    basic = true;
    result = await selectAll<CallRow>(build('id, company_name, started_at, transcript'));
  }
  if (result.error) throw result.error;
  return { rows: result.data || [], basic };
}

/** The team's competitors by name and other names; an empty list where there is no such table yet. */
export async function loadRivals(): Promise<Array<{ name: string; aliases?: string[] | null }>> {
  let result: { data: any; error: any } = await supabase.from('competitors').select('name, aliases, archived').order('name');
  if (result.error && isNotInstalled(result.error)) result = await supabase.from('competitors').select('name').order('name');
  if (result.error) {
    if (isNotInstalled(result.error)) return [];
    throw result.error;
  }
  return ((result.data || []) as Array<{ name: string; aliases?: string[] | null; archived?: boolean }>).filter((r) => !r.archived);
}

export async function loadCall(id: string): Promise<CallRow | null> {
  const { data, error } = await supabase.from('calls').select('*').eq('id', id).limit(1);
  if (error) throw error;
  return (data?.[0] as CallRow) || null;
}

/** A list from a table that may not exist yet: { rows, installed }. */
export async function optional<T>(read: () => PromiseLike<{ data: any; error: any }>): Promise<{ rows: T[]; installed: boolean }> {
  const { data, error } = await read();
  if (error) {
    if (isNotInstalled(error)) return { rows: [], installed: false };
    throw error;
  }
  return { rows: (data || []) as T[], installed: true };
}

export const loadTrackers = () => optional<Tracker>(() => supabase.from('call_trackers').select('id, name, phrases, who, is_active').order('name'));
export const loadScorecards = () => optional<Scorecard>(() => supabase.from('call_scorecards').select('id, name, items, is_active').order('name'));
export const loadComments = (callId: string) => optional<Comment>(() => supabase.from('call_comments').select('*').eq('call_id', callId).order('created_at', { ascending: true }));
export const loadScores = (callId: string) => optional<Score>(() => supabase.from('call_scores').select('*').eq('call_id', callId).order('created_at', { ascending: true }));
export const loadClips = () => optional<Clip>(() => supabase.from('call_clips').select('*').order('created_at', { ascending: false }).limit(200));

/** Save one change and say plainly when the database did not accept it (a change nobody may make touches no row, with no error). */
export async function saved(change: PromiseLike<{ data: any; error: any }>, refused = 'You may not make this change.') {
  const { data, error } = await change;
  if (error) throw new Error(/row-level security|permission denied/i.test(error.message) ? refused : error.message);
  if (Array.isArray(data) && data.length === 0) throw new Error(refused);
  return data;
}

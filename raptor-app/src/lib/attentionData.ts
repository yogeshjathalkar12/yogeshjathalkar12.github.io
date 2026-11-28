// What the "needs attention" list reads besides the deals. Every part that is not set up yet (a database update not run) is skipped and named.
import { supabase } from './supabaseClient';
import { selectAll } from './selectAll';
import { isNotInstalled } from './dbMissing';
import { loadRivals } from './callsData';
import { RECENT_CALL_DAYS, type WarnCall, type WarnRival, type WarnTask, type WarnTouch } from './dealWarnings';

export interface AttentionData { tasks: WarnTask[]; touches: WarnTouch[]; calls: WarnCall[]; rivals: WarnRival[]; missing: string[] }

/** How far back history is read. A deal untouched for longer is counted from the last thing found, or from the day it was made. */
export const HISTORY_DAYS = 400;

export async function loadAttentionData(): Promise<AttentionData> {
  const since = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const missing: string[] = [];

  const read = async <T,>(label: string, attempts: Array<() => any>): Promise<T[]> => {
    for (const build of attempts) {
      const result = await selectAll<T>(build);
      if (!result.error) return result.data || [];
      if (!isNotInstalled(result.error)) throw result.error;
    }
    if (label) missing.push(label);
    return [];
  };

  const [tasks, touches, recent, older, rivals] = await Promise.all([
    read<WarnTask>('tasks', [() => supabase.from('tasks').select('id, deal_id, contact_id, title, due_at, done_at').order('id')]),
    read<WarnTouch>('contact history', [
      () => supabase.from('interactions').select('id, deal_id, contact_id, created_at').gte('created_at', since(HISTORY_DAYS)).order('created_at', { ascending: false }),
      () => supabase.from('interactions').select('id, contact_id, created_at').gte('created_at', since(HISTORY_DAYS)).order('created_at', { ascending: false }),
    ]),
    read<WarnCall>('calls', [
      () => supabase.from('calls').select('id, deal_id, contact_id, started_at, metrics, segments, transcript').gte('started_at', since(RECENT_CALL_DAYS)).order('started_at', { ascending: false }),
      () => supabase.from('calls').select('id, contact_id, started_at, transcript').gte('started_at', since(RECENT_CALL_DAYS)).order('started_at', { ascending: false }),
    ]),
    read<WarnCall>('', [
      () => supabase.from('calls').select('id, deal_id, contact_id, started_at').gte('started_at', since(HISTORY_DAYS)).lt('started_at', since(RECENT_CALL_DAYS)).order('started_at', { ascending: false }),
      () => supabase.from('calls').select('id, contact_id, started_at').gte('started_at', since(HISTORY_DAYS)).lt('started_at', since(RECENT_CALL_DAYS)).order('started_at', { ascending: false }),
    ]),
    loadRivals().catch(() => [] as WarnRival[]),
  ]);
  return { tasks, touches, calls: [...recent, ...older], rivals, missing };
}

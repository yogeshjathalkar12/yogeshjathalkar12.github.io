// lib/bulk.ts
// Changing or deleting many records at once. The database decides record by record what the person may touch, so every action reports
// how many it really changed. Deleting goes to the recycle bin (db/migrations/2026-11-28_e_trash.sql) when it is installed.
import { chunks } from './timeline.ts';
import { isNotInstalled } from './dbMissing.ts';

export type RecordKind = 'contacts' | 'companies' | 'deals';
export interface BulkResult { changed: number; asked: number }

const PART = 150;

export async function bulkUpdate(db: any, table: RecordKind, ids: string[], patch: Record<string, unknown>): Promise<BulkResult> {
  let changed = 0;
  for (const part of chunks(ids, PART)) {
    const { data, error } = await db.from(table).update(patch).in('id', part).select('id');
    if (error) throw new Error(`${error.message}${changed ? ` (${changed} were changed before this)` : ''}`);
    changed += (data || []).length;
  }
  return { changed, asked: ids.length };
}

/** Moves records to the recycle bin. `null` = there is no bin yet (nothing was done): the caller deletes the old way. */
export async function moveToBin(db: any, table: RecordKind, ids: string[]): Promise<BulkResult | null> {
  let changed = 0;
  for (const part of chunks(ids, 500)) {
    const { data, error } = await db.rpc('crm_trash', { p_table: table, p_ids: part });
    if (error) {
      if (changed === 0 && isNotInstalled(error)) return null;
      throw new Error(error.message);
    }
    changed += Number(data) || 0;
  }
  return { changed, asked: ids.length };
}

/** "3 contacts deleted" or "2 of 3 contacts changed (the others are not yours to change)". */
export function bulkMessage(result: BulkResult, noun: string, done: string): string {
  const word = (n: number) => (n === 1 ? noun : noun === 'company' ? 'companies' : `${noun}s`);
  return result.changed === result.asked
    ? `${result.changed} ${word(result.changed)} ${done}.`
    : `${result.changed} of ${result.asked} ${word(result.asked)} ${done}. You do not have access to the others.`;
}

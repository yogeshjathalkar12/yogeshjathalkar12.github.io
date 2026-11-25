// lib/import/sharedMappings.ts
// The saved import mappings (savedMappings.ts) are kept in this browser; this adds the team's copy in the cloud
// (db/migrations/2026-11-25_crm_import_mappings.sql), so a teammate who imports a file with the same columns starts from the same mapping.
// Everything here FAILS SOFT: if the database part is not installed, or the connection is down, the import goes on with the browser's own
// mappings exactly as before and nothing is reported as an error. Only column names and field choices are shared, never a cell of data.

import type { DbClient } from './run.ts';
import type { SavedMapping } from './savedMappings.ts';

async function appClient(): Promise<DbClient> { return (await import('../supabaseClient.ts')).supabase as unknown as DbClient; }

const valid = (m: any): m is SavedMapping => !!m && m.v === 1 && typeof m.signature === 'string' && !!m.columns && typeof m.columns === 'object';

/** The organization's mappings, newest first; an empty list when they cannot be read. */
export async function loadShared(client?: DbClient): Promise<SavedMapping[]> {
  try {
    const db = client || await appClient();
    const { data, error } = await db.from('crm_import_mappings').select('signature,mapping,uses,updated_at').order('updated_at', { ascending: false }).limit(300);
    if (error || !Array.isArray(data)) return [];
    return data
      .map((r: any) => (valid(r.mapping) ? { ...r.mapping, signature: r.signature || r.mapping.signature, uses: Number(r.uses) || r.mapping.uses || 1, savedAt: r.updated_at || r.mapping.savedAt, shared: true } as SavedMapping : null))
      .filter((m): m is SavedMapping => !!m);
  } catch { return []; }
}

/** Share this mapping with the team. True when it was saved. */
export async function saveShared(m: SavedMapping, client?: DbClient): Promise<boolean> {
  try {
    const db = client || await appClient();
    const { shared, ...plain } = m as SavedMapping & { shared?: boolean };
    void shared;
    const { error } = await db.rpc('crm_import_mapping_save', { p_signature: plain.signature, p_headers: plain.headers, p_mapping: plain });
    return !error;
  } catch { return false; }
}

/** Make the team forget its mappings (owners and admins only; the database refuses anyone else). Returns how many were removed, or null. */
export async function forgetShared(client?: DbClient): Promise<number | null> {
  try {
    const db = client || await appClient();
    const { data, error } = await db.rpc('crm_import_mapping_forget', {});
    if (error) return null;
    return typeof data === 'number' ? data : 0;
  } catch { return null; }
}

/** Two lists into one: for the same columns the more recently saved mapping wins; newest first. */
export function mergeMappings(local: SavedMapping[], shared: SavedMapping[]): SavedMapping[] {
  const bySig = new Map<string, SavedMapping>();
  for (const m of [...local, ...shared]) {
    const have = bySig.get(m.signature);
    if (!have || String(m.savedAt) > String(have.savedAt)) bySig.set(m.signature, m);
  }
  return [...bySig.values()].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

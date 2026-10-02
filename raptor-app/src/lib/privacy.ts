import { supabase } from './supabaseClient';

// Privacy requests for one person (db/migrations/2026-10-06_contact_export_erase.sql):
// "give me everything you hold on me" and "delete everything about me".
// Owner/admin only - the database refuses anyone else. Kept in sync by hand
// with the desktop app's pages/crm/privacy.js.

const BUCKET = 'crm-attachments';

function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message || ''));
}

const NOT_READY = 'This needs a database update first. Run the latest SQL in Supabase (2026-10-06_contact_export_erase.sql), then try again.';

export async function exportContactData(contactId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc('export_contact', { p_id: contactId });
  if (error) throw new Error(isMissingFunction(error) ? NOT_READY : error.message);
  return data as Record<string, unknown>;
}

/** Saves the export as a .json file in the browser. */
export function downloadJson(name: string, data: unknown) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'contact';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contact-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface EraseResult {
  removed: Record<string, number>;
  /** Stored files the app could not delete (the database records are already gone). */
  leftoverFiles: string[];
}

/** Permanently erases the person and records about them, then deletes their stored files. */
export async function eraseContactData(contactId: string): Promise<EraseResult> {
  const { data, error } = await supabase.rpc('erase_contact', { p_id: contactId });
  if (error) throw new Error(isMissingFunction(error) ? NOT_READY : error.message);
  const paths: string[] = (data?.storage_paths as string[]) || [];
  let leftoverFiles: string[] = [];
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(paths);
    if (removeError) leftoverFiles = paths;
  }
  return { removed: (data?.removed as Record<string, number>) || {}, leftoverFiles };
}

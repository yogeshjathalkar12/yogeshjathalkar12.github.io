// lib/dbMissing.ts
// A screen whose database file has not been run yet must say so (or hide itself), not show an error. These are the answers the database
// service gives for a table, column or function that is not there.

const CODES = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);

export function isNotInstalled(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code && CODES.has(error.code)) return true;
  return /could not find the (table|function|column)|(relation|column|function) .* does not exist|schema cache/i.test(error.message || '');
}

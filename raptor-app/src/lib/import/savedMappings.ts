// lib/import/savedMappings.ts
// "A file with the same columns next time maps itself." After a successful import the mapping the person ended up with (which column is
// which field, what a row is, the stage matching, the "empty" words) is remembered, keyed by the file's COLUMN NAMES (not their position, not
// their order). A later file whose columns are the same, or nearly, starts from that mapping instead of from guesses. The person still sees
// it and can change anything; a column the saved mapping does not know is simply guessed as usual.
//
// Pure functions; the storage is passed in (localStorage in the browser) so everything is tested without a browser.

import { FIELD_BY_ID } from './columnGuess.ts';
import type { FieldId } from './columnGuess.ts';
import type { ColumnChoice, RowKind } from './plan.ts';

export interface SavedColumn { field: FieldId; customEntity?: RowKind; customName?: string }
export interface SavedMapping {
  v: 1;
  signature: string;
  headers: string[];                       // as the person's file wrote them, for showing
  rowKind: RowKind;
  columns: Record<string, SavedColumn>;    // by normalised header
  stageMap: Record<string, string>;        // lower-cased value in the file -> pipeline stage key
  emptyWords: string;
  savedAt: string;
  uses: number;
}

export const STORAGE_KEY = 'raptor_import_mappings_v1';
const MAX_SAVED = 40;

/** 'Contact Number', ' contact_number ' and 'CONTACT NUMBER' are the same column name. */
export const headerKey = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const signatureOf = (headers: string[]) => [...new Set(headers.map(headerKey).filter(Boolean))].sort().join('|');

export function buildSaved(headers: string[], choices: ColumnChoice[], rowKind: RowKind, stageMap: Record<string, string>, emptyWords: string, nowIso: string, uses = 1): SavedMapping {
  const columns: Record<string, SavedColumn> = {};
  headers.forEach((h, i) => {
    const c = choices[i];
    const key = headerKey(h);
    if (!c || !key) return;
    columns[key] = { field: c.field, ...(c.field === 'custom' ? { customEntity: c.customEntity, customName: c.customName } : {}) };
  });
  return { v: 1, signature: signatureOf(headers), headers: [...headers], rowKind, columns, stageMap: { ...stageMap }, emptyWords, savedAt: nowIso, uses };
}

export interface Found { mapping: SavedMapping; exact: boolean; matched: number; total: number }

/** The saved mapping for these column names: the same set of names, or one that covers at least 80 % of them (and at least 3). */
export function findSaved(list: SavedMapping[], headers: string[]): Found | null {
  const keys = [...new Set(headers.map(headerKey).filter(Boolean))];
  if (keys.length === 0) return null;
  const signature = signatureOf(headers);
  let best: Found | null = null;
  for (const m of list) {
    if (m.v !== 1) continue;
    if (m.signature === signature) return { mapping: m, exact: true, matched: keys.length, total: keys.length };
    const matched = keys.filter((k) => k in m.columns).length;
    const coverage = matched / keys.length;
    const reverse = matched / Math.max(1, Object.keys(m.columns).length);       // the saved file must not be a much bigger one
    if (matched >= 3 && coverage >= 0.8 && reverse >= 0.6 && (!best || matched > best.matched || (matched === best.matched && m.savedAt > best.mapping.savedAt))) {
      best = { mapping: m, exact: false, matched, total: keys.length };
    }
  }
  return best;
}

/** One choice per column of the new file: the saved one, or null where the saved mapping knows nothing (keep the guess). */
export function applySaved(found: Found, headers: string[]): (ColumnChoice | null)[] {
  return headers.map((h) => {
    const s = found.mapping.columns[headerKey(h)];
    if (!s || !FIELD_BY_ID.has(s.field)) return null;
    return s.field === 'custom' ? { field: 'custom', customEntity: s.customEntity, customName: s.customName ?? h } : { field: s.field };
  });
}

/** The list with this mapping added (replacing one for the same columns), newest first, bounded. */
export function upsert(list: SavedMapping[], m: SavedMapping): SavedMapping[] {
  const prior = list.find((x) => x.signature === m.signature);
  const next = { ...m, uses: (prior?.uses ?? 0) + 1 };
  return [next, ...list.filter((x) => x.signature !== m.signature)].slice(0, MAX_SAVED);
}

// ------------------------------------------------------------------ storage

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export function loadAll(store: KeyValueStore | null | undefined): SavedMapping[] {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((m) => m && m.v === 1 && typeof m.signature === 'string' && m.columns && typeof m.columns === 'object') : [];
  } catch { return []; }
}

export function saveAll(store: KeyValueStore | null | undefined, list: SavedMapping[]): boolean {
  try { store?.setItem(STORAGE_KEY, JSON.stringify(list)); return !!store; } catch { return false; }
}

export function forgetAll(store: KeyValueStore | null | undefined): void {
  try { store?.removeItem(STORAGE_KEY); } catch { /* storage unavailable: nothing was remembered anyway */ }
}

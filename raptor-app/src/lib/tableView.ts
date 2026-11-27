// lib/tableView.ts
// What a person sees in a CRM table: which columns (built-in and their own custom fields), in what order, sorted by what, filtered how.
// Pure functions; the screen (components/crm/ViewTable.tsx) only draws what is decided here, and the choices are remembered per person.

export type ColumnKind = 'text' | 'number' | 'date' | 'select';

export interface ColumnDef<R> {
  id: string;
  label: string;
  kind: ColumnKind;
  /** The plain value used to sort, filter and export (dates as 'YYYY-MM-DD...' text, numbers as numbers). */
  value: (row: R) => string | number | null | undefined;
  /** What goes into an exported file when that differs from what is shown (e.g. the full web address). */
  exportValue?: (row: R) => string | number | null | undefined;
  /** For a select column: the choices. */
  options?: string[];
  /** The first column: it can be moved down the list but never hidden. */
  locked?: boolean;
  defaultVisible?: boolean;
}

export interface ViewPrefs {
  visible: string[];                                        // column ids, in the order they are shown
  sort: { id: string; dir: 'asc' | 'desc' } | null;
  filters: Record<string, string>;
}

export const EMPTY_CHOICE = '__empty__';

export function defaultPrefs<R>(columns: ColumnDef<R>[]): ViewPrefs {
  return { visible: columns.filter((c) => c.locked || c.defaultVisible).map((c) => c.id), sort: null, filters: {} };
}

/** Prefs from an earlier visit, made to fit today's columns: a deleted custom field disappears from the view, the locked column is always there. */
export function reconcilePrefs<R>(prefs: Partial<ViewPrefs> | null | undefined, columns: ColumnDef<R>[]): ViewPrefs {
  const ids = new Set(columns.map((c) => c.id));
  if (!prefs || !Array.isArray(prefs.visible)) return defaultPrefs(columns);
  const visible = [...new Set(prefs.visible.filter((id) => ids.has(id)))];
  for (const c of columns) if (c.locked && !visible.includes(c.id)) visible.unshift(c.id);
  const sort = prefs.sort && ids.has(prefs.sort.id) && (prefs.sort.dir === 'asc' || prefs.sort.dir === 'desc') ? prefs.sort : null;
  const filters: Record<string, string> = {};
  for (const [id, text] of Object.entries(prefs.filters || {})) if (ids.has(id) && typeof text === 'string' && text.trim() !== '') filters[id] = text;
  return { visible, sort, filters };
}

export function toggleColumn<R>(prefs: ViewPrefs, columns: ColumnDef<R>[], id: string): ViewPrefs {
  const col = columns.find((c) => c.id === id);
  if (!col || col.locked) return prefs;
  if (prefs.visible.includes(id)) {
    const filters = { ...prefs.filters }; delete filters[id];
    return { visible: prefs.visible.filter((x) => x !== id), sort: prefs.sort?.id === id ? null : prefs.sort, filters };
  }
  return { ...prefs, visible: [...prefs.visible, id] };
}

export function moveColumn(prefs: ViewPrefs, id: string, delta: -1 | 1): ViewPrefs {
  const at = prefs.visible.indexOf(id);
  const to = at + delta;
  if (at < 0 || to < 0 || to >= prefs.visible.length) return prefs;
  const visible = [...prefs.visible];
  [visible[at], visible[to]] = [visible[to], visible[at]];
  return { ...prefs, visible };
}

/** Clicking a header: ascending, then descending, then back to the original order. */
export function cycleSort(prefs: ViewPrefs, id: string): ViewPrefs {
  const cur = prefs.sort;
  if (!cur || cur.id !== id) return { ...prefs, sort: { id, dir: 'asc' } };
  if (cur.dir === 'asc') return { ...prefs, sort: { id, dir: 'desc' } };
  return { ...prefs, sort: null };
}

export function setFilter(prefs: ViewPrefs, id: string, text: string): ViewPrefs {
  const filters = { ...prefs.filters };
  if (text.trim() === '') delete filters[id]; else filters[id] = text;
  return { ...prefs, filters };
}

export const hasFilters = (prefs: ViewPrefs) => Object.keys(prefs.filters).length > 0;

// ------------------------------------------------------------------ values

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.replace(/[,\s₹$€£]/g, ''));
  return v.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** The rows as the person sees them (after search, filters and sort) with EVERY column, built-in and custom, hidden ones too,
 *  for a CSV. Empty is an empty cell, dates are a day, and two columns with the same label get a number so no column is lost. */
export function exportRecords<R>(rows: R[], columns: ColumnDef<R>[]): { data: Record<string, string | number>[]; columns: { key: string; label: string }[] } {
  const seen = new Map<string, number>();
  const cols = columns.map((c) => {
    const n = (seen.get(c.label) || 0) + 1;
    seen.set(c.label, n);
    return { key: c.id, label: n === 1 ? c.label : `${c.label} (${n})` };
  });
  const data = rows.map((r) => {
    const rec: Record<string, string | number> = {};
    for (const c of columns) {
      const raw = (c.exportValue ?? c.value)(r);
      let v: string | number = raw === null || raw === undefined ? '' : raw;
      if (c.kind === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) v = v.slice(0, 10);
      rec[c.id] = v;
    }
    return rec;
  });
  return { data, columns: cols };
}

/** What the table prints for a value (dates as a day, empty as a dash). */
export function displayValue(kind: ColumnKind, v: unknown): string {
  if (isEmpty(v)) return '—';
  if (kind === 'date') return String(v).slice(0, 10);
  return String(v);
}

// made once: making it again for every comparison makes sorting a long list many times slower
const WORDS = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareValues(kind: ColumnKind, a: unknown, b: unknown): number {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;                                  // empty values go last, whichever way it is sorted (the caller keeps them there)
  if (isEmpty(b)) return -1;
  if (kind === 'number') {
    const x = asNumber(a), y = asNumber(b);
    if (x !== null && y !== null) return x - y;
    if (x !== null) return -1;
    if (y !== null) return 1;
  }
  if (kind === 'date') return String(a).slice(0, 19) < String(b).slice(0, 19) ? -1 : String(a).slice(0, 19) > String(b).slice(0, 19) ? 1 : 0;
  return WORDS.compare(String(a), String(b));
}

const OPERATOR = /^\s*(>=|<=|!=|>|<|=)\s*(.*)$/;
const RANGE = /^\s*(-?[\d.,]+)\s*(?:\.\.|to)\s*(-?[\d.,]+)\s*$/i;

/** A filter box's text as a test on one value. Text: contains (or "empty" / "filled"). Select: the chosen option. Number and date: > >= < <= = != or a..b. */
export function matcher(kind: ColumnKind, text: string): (v: unknown) => boolean {
  const t = text.trim();
  if (!t) return () => true;
  const lower = t.toLowerCase();
  if (kind === 'select') return (v) => (t === EMPTY_CHOICE ? isEmpty(v) : String(v ?? '') === t);
  if (lower === 'empty' || lower === 'blank') return (v) => isEmpty(v);
  if (lower === 'filled') return (v) => !isEmpty(v);
  if (kind === 'number') {
    const range = RANGE.exec(t);
    if (range) {
      const lo = asNumber(range[1]), hi = asNumber(range[2]);
      if (lo !== null && hi !== null) return (v) => { const n = asNumber(v); return n !== null && n >= Math.min(lo, hi) && n <= Math.max(lo, hi); };
    }
    const op = OPERATOR.exec(t);
    const num = asNumber(op ? op[2] : t);
    if (num !== null) {
      const o = op ? op[1] : '=';
      return (v) => {
        const n = asNumber(v);
        if (n === null) return o === '!=';
        return o === '>=' ? n >= num : o === '<=' ? n <= num : o === '>' ? n > num : o === '<' ? n < num : o === '!=' ? n !== num : n === num;
      };
    }
  }
  if (kind === 'date') {
    const op = OPERATOR.exec(t);
    if (op && /^\d{4}-\d{2}(-\d{2})?/.test(op[2].trim())) {
      const day = op[2].trim();
      const o = op[1];
      return (v) => {
        if (isEmpty(v)) return o === '!=';
        const s = String(v).slice(0, day.length);
        return o === '>=' ? s >= day : o === '<=' ? s <= day : o === '>' ? s > day : o === '<' ? s < day : o === '!=' ? s !== day : s === day;
      };
    }
  }
  return (v) => !isEmpty(v) && String(v).toLowerCase().includes(lower);
}

/** The rows as the view shows them: filtered by every filter box, then sorted (empty values always last). The input is not changed. */
export function applyView<R>(rows: R[], columns: ColumnDef<R>[], prefs: ViewPrefs): R[] {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const tests = Object.entries(prefs.filters)
    .map(([id, text]) => ({ col: byId.get(id), test: byId.get(id) ? matcher(byId.get(id)!.kind, text) : null }))
    .filter((x): x is { col: ColumnDef<R>; test: (v: unknown) => boolean } => !!x.col && !!x.test);
  let out = tests.length ? rows.filter((r) => tests.every((t) => t.test(t.col.value(r)))) : [...rows];
  const sort = prefs.sort && byId.get(prefs.sort.id);
  if (sort && prefs.sort) {
    const dir = prefs.sort.dir === 'asc' ? 1 : -1;
    out = out
      .map((r, i) => ({ r, i, v: sort.value(r) }))
      .sort((x, y) => {
        const ex = isEmpty(x.v), ey = isEmpty(y.v);
        if (ex || ey) return ex === ey ? x.i - y.i : ex ? 1 : -1;
        return compareValues(sort.kind, x.v, y.v) * dir || x.i - y.i;
      })
      .map((x) => x.r);
  }
  return out;
}

// ------------------------------------------------------------------ remembered per person

export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
const PREFIX = 'raptor_view_v1:';

export function loadPrefs<R>(store: KeyValueStore | null | undefined, key: string, columns: ColumnDef<R>[]): ViewPrefs {
  try {
    const raw = store?.getItem(PREFIX + key);
    return reconcilePrefs(raw ? JSON.parse(raw) : null, columns);
  } catch { return defaultPrefs(columns); }
}

/** The choice as it was saved, or null when the person never changed anything: the standard columns then follow the columns there are,
 *  including ones that appear a moment after the table does. */
export function savedChoice(store: KeyValueStore | null | undefined, key: string): Partial<ViewPrefs> | null {
  try {
    const raw = store?.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function savePrefs(store: KeyValueStore | null | undefined, key: string, prefs: ViewPrefs): void {
  try { store?.setItem(PREFIX + key, JSON.stringify(prefs)); } catch { /* storage unavailable: the choice just is not remembered */ }
}

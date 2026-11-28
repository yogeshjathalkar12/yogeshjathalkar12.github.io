// lib/largeList.ts
// Very large Contacts and Companies lists. Up to LARGE_LIST_FROM records a screen loads everything and searches, filters and sorts it
// in the browser (lib/tableView). Above that, downloading the whole list is too slow, so the database does the work and the screen
// asks for one page. This file turns what the person chose into the requests; it is pure, so it can be checked without a database.
import { EMPTY_CHOICE, type ViewPrefs } from './tableView.ts';

export const LARGE_LIST_FROM = 5000;
export const MAX_LOOKUP = 150;          // how many matching companies (or people) a name in a filter can stand for

export type ServerField =
  | { type: 'text' | 'number' | 'date'; column: string; sortable?: boolean }
  | { type: 'choice'; column: string; emptyAs?: string; sortable?: boolean }
  /** a column shown as a name but stored as an id: the caller finds the ids that match the typed text */
  | { type: 'lookup'; column: string };

export type Op = [method: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'ilike' | 'is' | 'not' | 'or' | 'in' | 'order', ...args: unknown[]];

const NOTHING: Op = ['eq', 'id', '00000000-0000-0000-0000-000000000000'];

/** A person's words as a "contains" pattern: their % and _ are ordinary characters. */
export const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;
/** A value inside an or(...) list, where commas and brackets would otherwise be read as part of the list. */
export const quoted = (value: string) => `"${value.replace(/[\\"]/g, '\\$&')}"`;

const OPERATOR = /^\s*(>=|<=|!=|>|<|=)\s*(.*)$/;
const RANGE = /^\s*(-?[\d.,]+)\s*(?:\.\.|to)\s*(-?[\d.,]+)\s*$/i;
const number = (text: string) => { const n = Number(text.replace(/[,\s₹$€£]/g, '')); return text.trim() !== '' && Number.isFinite(n) ? n : null; };

/** The first day of a typed day, month or year, and the first day after it. null when it is not one. */
export function period(text: string): [string, string] | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const from = new Date(Date.UTC(Number(y), mo ? Number(mo) - 1 : 0, d ? Number(d) : 1));
  if ((mo && (Number(mo) < 1 || Number(mo) > 12)) || (d && from.getUTCDate() !== Number(d))) return null;
  const to = new Date(from);
  if (d) to.setUTCDate(to.getUTCDate() + 1); else if (mo) to.setUTCMonth(to.getUTCMonth() + 1); else to.setUTCFullYear(to.getUTCFullYear() + 1);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
}

const emptyText = (column: string): Op => ['or', `${column}.is.null,${column}.eq.""`];

/** One filter box as requests. `ids` is what a lookup column's text stands for. */
export function filterOps(field: ServerField, text: string, ids: string[] = []): Op[] {
  const t = text.trim();
  if (!t) return [];
  const c = field.column;
  const lower = t.toLowerCase();
  if (field.type === 'choice') {
    if (t === EMPTY_CHOICE) return [['is', c, null]];
    return [t === field.emptyAs ? ['or', `${c}.is.null,${c}.eq.${quoted(t)}`] : ['eq', c, t]];
  }
  if (field.type === 'lookup') {
    if (t === EMPTY_CHOICE || lower === 'empty' || lower === 'blank') return [['is', c, null]];
    if (lower === 'filled') return [['not', c, 'is', null]];
    return ids.length ? [['in', c, ids]] : [NOTHING];
  }
  if (lower === 'empty' || lower === 'blank') return [field.type === 'text' ? emptyText(c) : ['is', c, null]];
  if (lower === 'filled') return field.type === 'text' ? [['not', c, 'is', null], ['neq', c, '']] : [['not', c, 'is', null]];
  if (field.type === 'text') return [['ilike', c, likePattern(t)]];
  const op = OPERATOR.exec(t);
  if (field.type === 'number') {
    const range = RANGE.exec(t);
    if (range) {
      const a = number(range[1]), b = number(range[2]);
      if (a !== null && b !== null) return [['gte', c, Math.min(a, b)], ['lte', c, Math.max(a, b)]];
    }
    const n = number(op ? op[2] : t);
    if (n === null) return [NOTHING];
    const o = op ? op[1] : '=';
    if (o === '!=') return [['or', `${c}.is.null,${c}.neq.${n}`]];
    return [[o === '>=' ? 'gte' : o === '<=' ? 'lte' : o === '>' ? 'gt' : o === '<' ? 'lt' : 'eq', c, n]];
  }
  const days = period(op ? op[2] : t);
  if (!days) return [NOTHING];
  const [from, to] = days;
  switch (op ? op[1] : '=') {
    case '>=': return [['gte', c, from]];
    case '>': return [['gte', c, to]];
    case '<': return [['lt', c, from]];
    case '<=': return [['lt', c, to]];
    case '!=': return [['or', `${c}.is.null,${c}.lt.${from},${c}.gte.${to}`]];
    default: return [['gte', c, from], ['lt', c, to]];
  }
}

export interface Plan {
  fields: Record<string, ServerField>;         // by table column id
  prefs: Pick<ViewPrefs, 'sort' | 'filters'>;
  lookups?: Record<string, string[]>;          // column id -> ids its filter text stands for
  search?: { text: string; columns: string[]; ids?: { column: string; values: string[] } };
  assignee?: { filter: string; me: string | null };
  defaultOrder: { column: string; ascending: boolean };
}

export function planOps({ fields, prefs, lookups = {}, search, assignee, defaultOrder }: Plan): Op[] {
  const ops: Op[] = [];
  const term = search?.text.trim();
  if (search && term) {
    const pattern = quoted(likePattern(term));
    const parts = search.columns.map((column) => `${column}.ilike.${pattern}`);
    if (search.ids?.values.length) parts.push(`${search.ids.column}.in.(${search.ids.values.join(',')})`);
    ops.push(['or', parts.join(',')]);
  }
  const who = assignee?.filter;
  if (who === 'mine' && assignee?.me) ops.push(['eq', 'assignee_id', assignee.me]);
  else if (who === 'unassigned') ops.push(['is', 'assignee_id', null]);
  else if (who?.startsWith('user:')) ops.push(['eq', 'assignee_id', who.slice(5)]);
  for (const [id, text] of Object.entries(prefs.filters)) {
    if (fields[id]) ops.push(...filterOps(fields[id], text, lookups[id]));
  }
  const sorted = prefs.sort ? fields[prefs.sort.id] : undefined;
  if (prefs.sort && sorted && sorted.type !== 'lookup' && sorted.sortable !== false) {
    ops.push(['order', sorted.column, { ascending: prefs.sort.dir === 'asc', nullsFirst: false }]);
  } else {
    ops.push(['order', defaultOrder.column, { ascending: defaultOrder.ascending, nullsFirst: false }]);
  }
  return ops;
}

/** Puts the requests on a database query. */
export function applyOps<Q>(query: Q, ops: Op[]): Q {
  return ops.reduce((q: any, [method, ...args]) => q[method](...args), query as any) as Q;
}

export const canSort = (field: ServerField | undefined) => !!field && field.type !== 'lookup' && field.sortable !== false;

/** A custom field as the database can search it (its value is stored inside `custom_fields`). Numbers cannot be compared there. */
export function customServerField(def: { id: string; field_type: string }): ServerField | null {
  const column = `custom_fields->>${def.id}`;
  if (def.field_type === 'number') return null;
  if (def.field_type === 'select') return { type: 'choice', column };
  return { type: def.field_type === 'date' ? 'date' : 'text', column };
}

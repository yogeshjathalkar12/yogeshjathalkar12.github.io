// Custom reports: a saved report says what to count or add up, how to group it, over which period and with which filters
// (db/migrations/2026-11-28_o_reports.sql keeps only that description). The numbers are worked out here from the records the person
// looking may see, so two people can get different totals from the same report.

export type Source = 'deals' | 'contacts' | 'companies' | 'tasks' | 'activities';
export type FieldKind = 'choice' | 'text' | 'tags' | 'number' | 'date';
export type Measure = 'count' | 'sum' | 'average';
export type Chart = 'bar' | 'line' | 'pie' | 'table' | 'number';
export type Op = 'is' | 'is_not' | 'contains' | 'filled' | 'empty' | 'over' | 'under';

export interface Filter { field: string; op: Op; value: string }
export interface ReportConfig {
  source: Source;
  measure: Measure;
  value: string;          // the number field added up or averaged
  group: string;          // '' = one total
  split?: string;         // a second grouping: each bar, point or row is divided by it
  period: string;
  periodField: string;
  filters: Filter[];
  chart: Chart;
}

export interface Field {
  id: string;
  label: string;
  kind: FieldKind;
  get: (row: any) => any;
  money?: boolean;
  order?: string[];       // the order choices are listed in (pipeline stages)
}

export interface ReportContext {
  stages?: { key: string; label: string; type: string; sort_order: number; pipeline_id?: string | null }[];
  pipelines?: Record<string, string>;
  people?: Record<string, string>;
  companies?: Record<string, string>;
  custom?: { id: string; entity_type: string; name: string; field_type: string }[];
  probability?: (deal: any) => number;
  now?: Date;
}

export const SOURCE_NAMES: Record<Source, string> = { deals: 'Deals', contacts: 'Contacts', companies: 'Companies', tasks: 'Tasks', activities: 'Activity' };
export const SOURCE_TABLES: Record<Source, string> = { deals: 'deals', contacts: 'contacts', companies: 'companies', tasks: 'tasks', activities: 'interactions' };
export const PERIODS: [string, string][] = [
  ['all', 'All time'], ['this_month', 'This month'], ['last_month', 'Last month'], ['this_quarter', 'This quarter'], ['this_year', 'This year'],
  ['last_90_days', 'Last 90 days'], ['last_12_months', 'Last 12 months'], ['next_90_days', 'Next 90 days'],
];
export const OP_NAMES: Record<Op, string> = { is: 'is', is_not: 'is not', contains: 'contains', filled: 'is filled in', empty: 'is empty', over: 'is over', under: 'is under' };
export const NONE = '(none)';

const capital = (text: any) => (text ? String(text).charAt(0).toUpperCase() + String(text).slice(1) : '');

export function fieldsOf(source: Source, ctx: ReportContext = {}): Field[] {
  const person = (id: any) => (id ? ctx.people?.[id] || 'Someone else' : '');
  const stage = (row: any) => ctx.stages?.find((s) => s.key === row.stage);
  const choice = (id: string, label: string, get: (r: any) => any, order?: string[]): Field => ({ id, label, kind: 'choice', get, order });
  const text = (id: string, label: string, get = (r: any) => r[id]): Field => ({ id, label, kind: 'text', get });
  const date = (id: string, label: string): Field => ({ id, label, kind: 'date', get: (r) => r[id] });
  const owner = choice('owner', 'Assigned to', (r) => person(r.assignee_id));
  const tags: Field = { id: 'tags', label: 'Tag', kind: 'tags', get: (r) => r.tags || [] };
  const company = choice('company', 'Company', (r) => (r.company_id ? ctx.companies?.[r.company_id] || '' : ''));
  const entity = source === 'deals' ? 'deal' : source === 'contacts' ? 'contact' : source === 'companies' ? 'company' : '';
  const custom: Field[] = (ctx.custom || []).filter((d) => d.entity_type === entity).map((d) => ({
    id: `cf:${d.id}`, label: d.name,
    kind: d.field_type === 'number' ? 'number' : d.field_type === 'date' ? 'date' : d.field_type === 'select' ? 'choice' : 'text',
    get: (r: any) => r.custom_fields?.[d.id],
  }));
  if (source === 'deals') {
    const ordered = [...(ctx.stages || [])].sort((a, b) => a.sort_order - b.sort_order);
    return [
      choice('stage', 'Stage', (r) => stage(r)?.label || r.stage, ordered.map((s) => s.label)),
      choice('status', 'Open, won or lost', (r) => capital(stage(r)?.type || 'open'), ['Open', 'Won', 'Lost']),
      choice('pipeline', 'Pipeline', (r) => { const s = stage(r); return s?.pipeline_id ? ctx.pipelines?.[s.pipeline_id] || 'Main pipeline' : 'Main pipeline'; }),
      owner, company, tags,
      { id: 'value', label: 'Value', kind: 'number', money: true, get: (r) => r.value },
      { id: 'weighted', label: 'Value × chance of closing', kind: 'number', money: true, get: (r) => ((Number(r.value) || 0) * (ctx.probability?.(r) ?? 0)) / 100 },
      date('created_at', 'Added'), date('expected_close', 'Expected to close'), date('closed_at', 'Closed'),
      ...custom,
    ];
  }
  if (source === 'contacts') {
    return [choice('status', 'Status', (r) => capital(r.status), ['New', 'Cold', 'Active', 'Hot']), owner, company, tags, text('job_title', 'Job title'),
      date('created_at', 'Added'), date('last_interaction_at', 'Last contacted'), ...custom];
  }
  if (source === 'companies') {
    return [choice('industry', 'Industry', (r) => r.industry), choice('city', 'City', (r) => r.city), owner, tags, date('created_at', 'Added'), ...custom];
  }
  if (source === 'tasks') {
    const now = (ctx.now || new Date()).getTime();
    return [choice('state', 'State', (r) => (r.done_at ? 'Done' : r.due_at && new Date(r.due_at).getTime() < now ? 'Overdue' : 'To do'), ['To do', 'Overdue', 'Done']),
      owner, date('created_at', 'Added'), date('due_at', 'Due'), date('done_at', 'Finished')];
  }
  return [choice('type', 'Kind', (r) => capital(r.type)), choice('direction', 'Direction', (r) => (r.direction === 'inbound' ? 'Received' : r.direction === 'outbound' ? 'Sent' : '')),
    choice('person', 'Added by', (r) => person(r.created_by)), date('created_at', 'Date')];
}

export const blankConfig = (source: Source = 'deals'): ReportConfig => ({
  source, measure: 'count', value: '', group: source === 'deals' ? 'stage' : source === 'contacts' ? 'status' : source === 'companies' ? 'industry' : source === 'tasks' ? 'state' : 'type',
  period: 'all', periodField: 'created_at', filters: [], chart: 'bar',
});

export const STARTERS: { name: string; config: ReportConfig }[] = [
  { name: 'Open pipeline by stage', config: { ...blankConfig(), measure: 'sum', value: 'value', filters: [{ field: 'status', op: 'is', value: 'Open' }] } },
  { name: 'Deals won by month', config: { ...blankConfig(), measure: 'sum', value: 'value', group: 'closed_at', period: 'last_12_months', periodField: 'closed_at', filters: [{ field: 'status', op: 'is', value: 'Won' }], chart: 'line' } },
  { name: 'Contacts added by month', config: { ...blankConfig('contacts'), group: 'created_at', period: 'last_12_months' } },
  { name: 'Tasks by person', config: { ...blankConfig('tasks'), group: 'owner', filters: [{ field: 'state', op: 'is_not', value: 'Done' }] } },
];

/** A saved description that may be old or hand-made: filled up and tidied so the screens can rely on it. */
export function readConfig(raw: any, ctx: ReportContext = {}): ReportConfig {
  const source: Source = raw && raw.source in SOURCE_NAMES ? raw.source : 'deals';
  const base = blankConfig(source);
  const fields = fieldsOf(source, ctx);
  const has = (id: string, kinds?: FieldKind[]) => fields.some((f) => f.id === id && (!kinds || kinds.includes(f.kind)));
  const measure: Measure = ['count', 'sum', 'average'].includes(raw?.measure) ? raw.measure : 'count';
  const value = has(raw?.value, ['number']) ? raw.value : fields.find((f) => f.kind === 'number')?.id || '';
  return {
    source,
    measure: value ? measure : 'count',
    value,
    group: raw?.group === '' || has(raw?.group) ? raw.group : base.group,
    ...(raw?.split && raw.split !== raw?.group && has(raw.split, ['choice', 'text', 'tags']) ? { split: raw.split } : {}),
    period: PERIODS.some(([k]) => k === raw?.period) ? raw.period : 'all',
    periodField: has(raw?.periodField, ['date']) ? raw.periodField : 'created_at',
    filters: (Array.isArray(raw?.filters) ? raw.filters : []).filter((f: any) => f && has(f.field) && f.op in OP_NAMES).slice(0, 8)
      .map((f: any) => ({ field: f.field, op: f.op, value: String(f.value ?? '') })),
    chart: ['bar', 'line', 'pie', 'table', 'number'].includes(raw?.chart) ? raw.chart : 'bar',
  };
}

export function opsFor(kind: FieldKind): Op[] {
  if (kind === 'number' || kind === 'date') return ['over', 'under', 'is', 'filled', 'empty'];
  if (kind === 'text') return ['contains', 'is', 'is_not', 'filled', 'empty'];
  return ['is', 'is_not', 'contains', 'filled', 'empty'];
}

/** The day a stored date or time falls on for the person looking: "2026-11-27". A plain date is taken as written. */
export function dayOf(value: any): string {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** First and last day (both included) of a period; null = no limit. */
export function periodRange(period: string, now: Date = new Date()): [string, string] | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = (d: Date) => dayOf(d.toISOString());
  const at = (yy: number, mm: number, dd: number) => day(new Date(yy, mm, dd, 12));
  const today = at(y, m, now.getDate());
  switch (period) {
    case 'this_month': return [at(y, m, 1), at(y, m + 1, 0)];
    case 'last_month': return [at(y, m - 1, 1), at(y, m, 0)];
    case 'this_quarter': { const q = Math.floor(m / 3) * 3; return [at(y, q, 1), at(y, q + 3, 0)]; }
    case 'this_year': return [at(y, 0, 1), at(y, 11, 31)];
    case 'last_90_days': return [at(y, m, now.getDate() - 89), today];
    case 'last_12_months': return [at(y, m - 11, 1), at(y, m + 1, 0)];
    case 'next_90_days': return [today, at(y, m, now.getDate() + 89)];
    default: return null;
  }
}

const isBlank = (v: any) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

export function passes(field: Field, row: any, filter: Filter): boolean {
  const raw = field.get(row);
  if (filter.op === 'empty') return isBlank(raw);
  if (filter.op === 'filled') return !isBlank(raw);
  const wanted = filter.value.trim().toLowerCase();
  if (!wanted) return true;                                 // a filter still being typed narrows nothing
  if (field.kind === 'number') {
    const n = Number(wanted);
    if (Number.isNaN(n) || isBlank(raw) || Number.isNaN(Number(raw))) return false;
    return filter.op === 'over' ? Number(raw) > n : filter.op === 'under' ? Number(raw) < n : Number(raw) === n;
  }
  if (field.kind === 'date') {
    const d = dayOf(raw);
    if (!d) return false;
    return filter.op === 'over' ? d > wanted : filter.op === 'under' ? d < wanted : d === wanted;
  }
  const values = (Array.isArray(raw) ? raw : [raw]).map((v) => String(v ?? '').toLowerCase());
  if (filter.op === 'contains') return values.some((v) => v.includes(wanted));
  const same = values.some((v) => v === wanted);
  return filter.op === 'is_not' ? !same : same;
}

export interface Point { label: string; value: number; count: number; parts?: Record<string, number> }
export interface ReportResult { points: Point[]; total: number; count: number; money: boolean; measureName: string; series?: string[] }

const MAX_SERIES = 8;

const MAX_GROUPS = 25;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  while (out.length < 120) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > last) break;
    out.push(key);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

export function runReport(config: ReportConfig, rows: any[], ctx: ReportContext = {}): ReportResult {
  const now = ctx.now || new Date();
  const fields = fieldsOf(config.source, ctx);
  const field = (id: string) => fields.find((f) => f.id === id);
  const range = periodRange(config.period, now);
  const dateField = field(config.periodField);
  const kept = rows.filter((row) => {
    if (row.deleted_at) return false;
    if (range && dateField) {
      const d = dayOf(dateField.get(row));
      if (!d || d < range[0] || d > range[1]) return false;
    }
    return config.filters.every((f) => { const target = field(f.field); return !target || passes(target, row, f); });
  });

  const valueField = config.measure === 'count' ? undefined : field(config.value);
  const measureOf = (list: any[]): number => {
    if (!valueField) return list.length;
    const numbers = list.map((r) => valueField.get(r)).filter((v) => !isBlank(v) && !Number.isNaN(Number(v))).map(Number);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const result = config.measure === 'average' ? (numbers.length ? sum / numbers.length : 0) : sum;
    return Math.round(result * 100) / 100;
  };
  const result: ReportResult = {
    points: [], total: measureOf(kept), count: kept.length, money: !!valueField?.money,
    measureName: !valueField ? 'Count' : `${config.measure === 'average' ? 'Average' : 'Total'} ${valueField.label.toLowerCase()}`,
  };
  const group = config.group ? field(config.group) : undefined;
  if (!group) return result;

  const buckets = new Map<string, any[]>();
  const put = (key: string, row: any) => { const list = buckets.get(key); if (list) list.push(row); else buckets.set(key, [row]); };
  for (const row of kept) {
    const raw = group.get(row);
    if (group.kind === 'date') put(dayOf(raw).slice(0, 7), row);
    else if (group.kind === 'tags') (raw.length ? raw : [NONE]).forEach((t: string) => put(t, row));
    else put(isBlank(raw) ? NONE : String(raw), row);
  }
  // the second grouping: which divisions there are (the biggest ones, the rest together), and each group's value for each
  const splitField = config.split ? field(config.split) : undefined;
  let divide: ((list: any[]) => Record<string, number>) | null = null;
  if (splitField) {
    const keysOf = (row: any): string[] => {
      const raw = splitField.get(row);
      if (splitField.kind === 'tags') return raw.length ? raw : [NONE];
      return [isBlank(raw) ? NONE : String(raw)];
    };
    const sizes = new Map<string, number>();
    kept.forEach((row) => keysOf(row).forEach((k) => sizes.set(k, (sizes.get(k) || 0) + 1)));
    let names = [...sizes.keys()];
    const order = splitField.order;
    names.sort((a, b) => (order ? (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)
      : Number(a === NONE) - Number(b === NONE) || (sizes.get(b) as number) - (sizes.get(a) as number) || a.localeCompare(b)));
    const folded = names.length > MAX_SERIES ? new Set(names.slice(MAX_SERIES - 1)) : new Set<string>();
    const rest = `Other (${folded.size})`;
    if (folded.size) names = [...names.slice(0, MAX_SERIES - 1), rest];
    result.series = names;
    divide = (list) => {
      const bins = new Map<string, any[]>(names.map((n) => [n, []]));
      list.forEach((row) => new Set(keysOf(row).map((k) => (folded.has(k) ? rest : k))).forEach((k) => bins.get(k)?.push(row)));
      return Object.fromEntries(names.map((n) => [n, measureOf(bins.get(n) as any[])]));
    };
  }
  const point = (label: string, list: any[]): Point => ({ label, value: measureOf(list), count: list.length, ...(divide ? { parts: divide(list) } : {}) });

  if (group.kind === 'date') {
    const present = [...buckets.keys()].filter(Boolean).sort();
    let first = present[0];
    let last = present[present.length - 1];
    if (range && group.id === config.periodField) { first = range[0].slice(0, 7); last = range[1].slice(0, 7); }     // months with nothing show as zero
    const months = first ? monthsBetween(first, last).slice(-60) : [];
    result.points = months.map((m) => point(monthName(m), buckets.get(m) || []));
    if (buckets.has('')) result.points.push(point('No date', buckets.get('') as any[]));
    return result;
  }
  const all = [...buckets.entries()].map(([label, list]) => ({ ...point(label, list), list }));
  const order = group.order;
  if (order) {
    const place = (label: string) => { const i = order.indexOf(label); return i < 0 ? order.length : i; };
    all.sort((a, b) => place(a.label) - place(b.label));
  } else {
    all.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }
  const shown = all.length > MAX_GROUPS ? all.slice(0, MAX_GROUPS - 1) : all;
  result.points = shown.map(({ label, value, count, parts }) => ({ label, value, count, ...(parts ? { parts } : {}) }));
  if (all.length > shown.length) result.points.push(point(`Other (${all.length - shown.length})`, all.slice(shown.length).flatMap((p) => p.list)));
  return result;
}

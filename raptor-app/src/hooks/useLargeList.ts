import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { selectAll } from '../lib/selectAll';
import { TABLE_PAGE } from '../lib/paging';
import { EMPTY_CHOICE, type ViewPrefs } from '../lib/tableView';
import { LARGE_LIST_FROM, MAX_LOOKUP, applyOps, planOps, type ServerField } from '../lib/largeList';

export type ListSize = 'counting' | 'small' | 'large';

/** Is this list too long to download whole? If it cannot be counted it is treated as an ordinary one. */
export function useListSize(table: 'contacts' | 'companies'): ListSize {
  const [size, setSize] = useState<ListSize>('counting');
  useEffect(() => {
    let alive = true;
    Promise.resolve(supabase.from(table).select('id', { count: 'exact', head: true }))
      .then(({ count, error }: any) => { if (alive) setSize(!error && (count ?? 0) > LARGE_LIST_FROM ? 'large' : 'small'); })
      .catch(() => { if (alive) setSize('small'); });
    return () => { alive = false; };
  }, [table]);
  return size;
}

export interface LargeListOptions {
  enabled: boolean;
  table: 'contacts' | 'companies';
  select: string;
  fields: Record<string, ServerField>;
  defaultOrder: { column: string; ascending: boolean };
  search: string;
  searchColumns: string[];
  /** the search box also looks at the names of the companies linked to a record */
  searchCompanies?: boolean;
  assignee?: { filter: string; me: string | null };
  /** for a column shown as a name: the ids the typed text stands for */
  lookup?: (columnId: string, text: string) => Promise<string[]> | string[];
}

export async function companyIdsNamed(text: string): Promise<string[]> {
  const pattern = `%${text.trim().replace(/[\\%_]/g, '\\$&')}%`;
  const { data, error } = await supabase.from('companies').select('id').ilike('name', pattern).order('name').limit(MAX_LOOKUP);
  if (error) throw error;
  return (data || []).map((c: any) => c.id);
}

/** One page of a very long list, searched, filtered and sorted by the database. */
export function useLargeList(options: LargeListOptions) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [prefs, setPrefsState] = useState<Pick<ViewPrefs, 'sort' | 'filters'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const asked = useRef(0);

  // typing is not sent letter by letter
  const [search, setSearch] = useState(options.search);
  useEffect(() => { const t = setTimeout(() => setSearch(options.search), 350); return () => clearTimeout(t); }, [options.search]);

  const arrangement = JSON.stringify([search, options.assignee?.filter, prefs]);
  const [shownFor, setShownFor] = useState(arrangement);
  if (shownFor !== arrangement) { setShownFor(arrangement); setPage(0); }        // a new search or filter starts at the first page

  /** The requests for what is chosen now, without a page: used for the page on screen and for exporting everything that matches. */
  const prepare = useCallback(async () => {
    const o = latest.current;
    const chosen = prefs || { sort: null, filters: {} };
    const lookups: Record<string, string[]> = {};
    for (const [id, text] of Object.entries(chosen.filters)) {
      const t = text.trim();
      if (o.fields[id]?.type !== 'lookup' || !t || t === EMPTY_CHOICE || /^(empty|blank|filled)$/i.test(t)) continue;
      lookups[id] = o.lookup ? await o.lookup(id, t) : [];
    }
    const term = search.trim();
    const ids = term && o.searchCompanies ? { column: 'company_id', values: await companyIdsNamed(term) } : undefined;
    return planOps({ fields: o.fields, prefs: chosen, lookups, search: { text: term, columns: o.searchColumns, ids }, assignee: o.assignee, defaultOrder: o.defaultOrder });
  }, [prefs, search]);

  const fieldsKey = Object.keys(options.fields).join(',');
  useEffect(() => {
    if (!options.enabled || prefs === null) return;
    const mine = ++asked.current;
    setLoading(true);
    (async () => {
      try {
        const ops = await prepare();
        const from = page * TABLE_PAGE;
        const o = latest.current;
        const { data, count, error: failed } = await applyOps(supabase.from(o.table).select(o.select, { count: 'exact' }), ops).order('id', { ascending: true }).range(from, from + TABLE_PAGE - 1);
        if (mine !== asked.current) return;                    // an older answer arriving late
        if (failed) throw failed;
        setRows(data || []);
        setTotal(count ?? 0);
        setError('');
        if (!data?.length && page > 0) setPage(Math.max(0, Math.ceil((count ?? 0) / TABLE_PAGE) - 1));
      } catch (e: any) {
        if (mine === asked.current) { setError(e?.message || 'This page could not be loaded.'); setRows([]); }
      } finally {
        if (mine === asked.current) setLoading(false);
      }
    })();
  }, [options.enabled, prepare, page, tick, fieldsKey, options.assignee?.filter, options.assignee?.me]); // eslint-disable-line react-hooks/exhaustive-deps

  const everything = useCallback(async () => {
    const ops = await prepare();
    const o = latest.current;
    const { data, error: failed } = await selectAll(() => applyOps(supabase.from(o.table).select(o.select), ops));
    if (failed) throw failed;
    return data || [];
  }, [prepare]);

  const setPrefs = useCallback((next: Pick<ViewPrefs, 'sort' | 'filters'>) => {
    setPrefsState((old) => (old && JSON.stringify(old) === JSON.stringify(next) ? old : { sort: next.sort, filters: next.filters }));
  }, []);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { rows, total, page, setPage, setPrefs, loading, error, reload, everything };
}

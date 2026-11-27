// lib/selectAll.ts
// The database service answers at most 1,000 rows per request (Supabase, Settings > API > Max rows), without saying that it left some
// out. A screen that needs EVERY row of a list, to show, search, total or export it, asks for it page by page with this.
//
//   const { data, error } = await selectAll(() => supabase.from('contacts').select('*').order('name'));
//
// After a full first page the next ones are asked for several at a time, so a long list arrives much faster. `onFirst` is given the
// first page as soon as it is there, for a screen that can show something while the rest comes (never for totals).
//
// `build` must make a NEW query each time it is called. A last ordering on a unique column keeps the pages from overlapping or skipping
// rows that sort the same; pass `uniqueColumn` for a table that has no `id`.

export const PAGE_SIZE = 1000;
export const PARALLEL = 4;      // pages asked for at the same time
const MAX_PAGES = 500;          // half a million rows: a stop for a query that never runs out

export interface AllRows<T = any> { data: T[] | null; error: any }

export async function selectAll<T = any>(build: () => any, uniqueColumn = 'id', onFirst?: (rows: T[]) => void): Promise<AllRows<T>> {
  const fetchPage = (page: number): PromiseLike<AllRows<T>> => {
    const from = page * PAGE_SIZE;
    return build().order(uniqueColumn, { ascending: true }).range(from, from + PAGE_SIZE - 1);
  };
  const first = await fetchPage(0);
  if (first.error) return { data: null, error: first.error };
  const rows: T[] = [...((first.data || []) as T[])];
  if (rows.length < PAGE_SIZE) return { data: rows, error: null };
  onFirst?.([...rows]);
  for (let page = 1; page < MAX_PAGES; page += PARALLEL) {
    const batch = await Promise.all(Array.from({ length: PARALLEL }, (_, i) => fetchPage(page + i)));
    for (const { data, error } of batch) {
      if (error) return { data: null, error };
      rows.push(...((data || []) as T[]));
      if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };      // the end: later answers hold nothing
    }
  }
  return { data: rows, error: null };
}

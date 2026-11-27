// lib/selectAll.ts
// The database service answers at most 1,000 rows per request (Supabase, Settings > API > Max rows), without saying that it left some
// out. A screen that needs EVERY row of a list, to show, search, total or export it, asks for it page by page with this.
//
//   const { data, error } = await selectAll(() => supabase.from('contacts').select('*').order('name'));
//
// `build` must make a NEW query each time it is called. A last ordering on a unique column keeps the pages from overlapping or skipping
// rows that sort the same; pass `uniqueColumn` for a table that has no `id`.

export const PAGE_SIZE = 1000;
const MAX_PAGES = 500;          // half a million rows: a stop for a query that never runs out

export interface AllRows<T = any> { data: T[] | null; error: any }

export async function selectAll<T = any>(build: () => any, uniqueColumn = 'id'): Promise<AllRows<T>> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build().order(uniqueColumn, { ascending: true }).range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...((data || []) as T[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}

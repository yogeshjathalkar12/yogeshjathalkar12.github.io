// Long lists are drawn a part at a time: the browser stays quick with thousands of records. Searching, sorting, totals and export
// still work on the whole list; only what is drawn is cut.

export const TABLE_PAGE = 100;       // rows of a table page
export const COLUMN_STEP = 50;       // cards of a pipeline column, and how many more each press shows

export interface Page<T> { rows: T[]; page: number; pages: number; from: number; to: number }

/** Page `page` (counted from 0, kept within what exists). `from` and `to` are the places shown, counted from 1. */
export function pageOf<T>(rows: T[], page: number, size: number = TABLE_PAGE): Page<T> {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const at = Math.min(Math.max(0, Math.floor(page) || 0), pages - 1);
  const start = at * size;
  const shown = rows.slice(start, start + size);
  return { rows: shown, page: at, pages, from: shown.length ? start + 1 : 0, to: start + shown.length };
}

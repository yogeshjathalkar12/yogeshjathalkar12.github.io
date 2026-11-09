// lib/import/sheetShape.ts
// Finds the TABLE inside a sheet: which row is the header, which columns are real, which rows are records.
// Real spreadsheets have a title above the header, blank or numbered first columns, section lines, totals,
// several sheets of which only some are lists. None of that is assumed away; each case is detected and reported.

import { cleanText } from './values.ts';

export interface TableColumn {
  index: number;       // column position in the sheet
  header: string;      // unique, readable
  letter: string;      // A, B ... as Excel shows it
  filled: number;      // how many data rows have a real value
  serial: boolean;     // only 1,2,3... : a row counter, not data
}

export interface SheetTable {
  name: string;
  hidden: boolean;
  headerRow: number;                 // 1-based row number in the sheet
  columns: TableColumn[];
  rows: string[][];                  // data rows, cells aligned with `columns`
  rowNumbers: number[];              // 1-based sheet row of each data row (for error messages)
  skipped: { row: number; why: string }[];
  verdict: 'list' | 'small' | 'not_a_table';
  verdictWhy: string;
}

export function columnLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

const isNumberish = (s: string) => /^-?[\d.,]+$/.test(s.trim());

function filledCells(row: string[]): string[] {
  return row.map((c) => cleanText(c)).filter(Boolean);
}

/** How header-like a row is: many short, distinct, non-numeric texts. */
function headerScore(row: string[]): number {
  const cells = filledCells(row);
  if (cells.length < 2) return 0;
  const texts = cells.filter((c) => !isNumberish(c) && c.length <= 70 && !/@/.test(c) && !/^https?:\/\//i.test(c));
  const distinct = new Set(texts.map((t) => t.toLowerCase())).size;
  if (!texts.length) return 0;
  return (texts.length / cells.length) * Math.min(texts.length, distinct) ;
}

const SECTION_LINE = /^(section\b|total\b|grand total\b|sub-?total\b|notes?:|summary\b|source:|legend\b|\*+\s)/i;

/** A column of 1,2,3,... (or 1,2,4,5 with gaps after removals): a row counter. */
function looksSerial(values: string[]): boolean {
  const nums = values.map((v) => v.trim()).filter(Boolean);
  if (nums.length < 3 || !nums.every((v) => /^\d{1,6}$/.test(v))) return false;
  const n = nums.map(Number);
  const ascending = n.every((v, i) => i === 0 || v > n[i - 1]);
  return ascending && n[0] <= 2 && n[n.length - 1] <= n.length * 3;
}

export function analyseSheet(name: string, hidden: boolean, rawRows: string[][]): SheetTable {
  const grid = rawRows.map((r) => r.map((c) => String(c ?? '').replace(/ /g, ' ')));
  const empty = (why: string): SheetTable => ({ name, hidden, headerRow: 0, columns: [], rows: [], rowNumbers: [], skipped: [], verdict: 'not_a_table', verdictWhy: why });
  const nonEmptyRows = grid.filter((r) => filledCells(r).length > 0);
  if (nonEmptyRows.length === 0) return empty('The sheet is empty.');

  // header = the first row among the top ones that looks like a header and is followed by rows of about the same width
  const limit = Math.min(grid.length, 30);
  const widths = grid.slice(0, limit).map((r) => filledCells(r).length);
  const maxW = Math.max(...widths, 0);
  let headerIdx = -1;
  for (let i = 0; i < limit; i++) {
    const w = widths[i];
    if (w < 1) continue;
    if (maxW >= 2 && w < Math.max(2, Math.ceil(maxW * 0.6))) continue;
    if (maxW >= 2 && headerScore(grid[i]) < 1.5) continue;
    headerIdx = i;
    break;
  }
  if (headerIdx < 0) {
    // a single column of names with no usable header: treat the first non-empty row as the header
    headerIdx = grid.findIndex((r) => filledCells(r).length > 0);
  }
  const headerCells = grid[headerIdx];
  const dataRaw = grid.slice(headerIdx + 1);

  // which columns carry anything
  const width = Math.max(headerCells.length, ...dataRaw.map((r) => r.length), 0);
  const candidates: number[] = [];
  for (let c = 0; c < width; c++) {
    const h = cleanText(headerCells[c] || '');
    const hasData = dataRaw.some((r) => cleanText(r[c] || '') !== '');
    if (h || hasData) candidates.push(c);
  }

  // records: rows with at least one real value; section lines and totals are set aside, never silently lost
  const skipped: { row: number; why: string }[] = [];
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  dataRaw.forEach((r, i) => {
    const sheetRow = headerIdx + 2 + i;
    const cells = candidates.map((c) => String(r[c] ?? '').trim());
    const real = cells.filter((x) => cleanText(x) !== '');
    if (real.length === 0) return;
    if (real.length === 1 && candidates.length >= 3 && SECTION_LINE.test(real[0])) { skipped.push({ row: sheetRow, why: `"${real[0].slice(0, 40)}" looks like a title or total, not a record` }); return; }
    rows.push(cells);
    rowNumbers.push(sheetRow);
  });

  // unique readable headers; a column with no header is named by its letter
  const used = new Map<string, number>();
  const columns: TableColumn[] = candidates.map((c, k) => {
    let header = cleanText(headerCells[c] || '').replace(/\s+/g, ' ');
    if (!header) header = `Column ${columnLetter(c)}`;
    const key = header.toLowerCase();
    const seen = (used.get(key) || 0) + 1;
    used.set(key, seen);
    if (seen > 1) header = `${header} (${seen})`;
    const values = rows.map((r) => r[k]);
    return { index: c, header, letter: columnLetter(c), filled: values.filter((v) => cleanText(v) !== '').length, serial: looksSerial(values) };
  });

  // drop a counter column that has no header at all (it is only the row numbers Excel users type in)
  const keep = columns.map((col, k) => !(col.serial && /^Column [A-Z]+$/.test(col.header)) && col.filled > 0 ? k : -1).filter((k) => k >= 0);
  const finalColumns = keep.map((k) => columns[k]);
  const finalRows = rows.map((r) => keep.map((k) => r[k]));

  let verdict: SheetTable['verdict'] = 'list';
  let why = `${finalRows.length} rows, ${finalColumns.length} columns`;
  if (finalRows.length === 0 || finalColumns.length === 0) { verdict = 'not_a_table'; why = 'No rows under a header were found.'; }
  else if (finalColumns.length < 2 && finalRows.length < 3) { verdict = 'small'; why = 'Too little to be a list.'; }
  else if (finalRows.length < 5 || finalColumns.length < 2) { verdict = 'small'; why = `Only ${finalRows.length} row${finalRows.length === 1 ? '' : 's'}: probably a summary, not a list.`; }
  return { name, hidden, headerRow: headerIdx + 1, columns: finalColumns, rows: finalRows, rowNumbers, skipped, verdict, verdictWhy: why };
}

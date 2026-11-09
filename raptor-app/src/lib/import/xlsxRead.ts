// lib/import/xlsxRead.ts
// Reads an Excel workbook (.xlsx / .xlsm) or a delimited text file (CSV, semicolon, tab) into plain grids of text,
// with NO third-party library: an .xlsx is a zip of XML files, the zip is unpacked with the browser's own
// DecompressionStream and the XML is read with small regular expressions (so it also runs under Node for tests).
//
// What it returns is deliberately dumb: every sheet as rows of strings, exactly what a person sees in the cells
// (dates as ISO text, numbers as Excel stored them). Deciding what is a header, a name or a phone is NOT done here
// (see sheetShape.ts, columnGuess.ts, values.ts).

export interface RawSheet {
  name: string;
  hidden: boolean;
  rows: string[][];
  truncated?: boolean; // the sheet had more rows/columns than we read
}

export const LIMITS = {
  maxRows: 100_000,
  maxCols: 300,
  maxXmlBytes: 120 * 1024 * 1024, // one unpacked XML part
  maxFileBytes: 60 * 1024 * 1024,
};

// ------------------------------------------------------------------ zip

interface ZipEntry { name: string; method: number; compSize: number; offset: number }

function readZipDirectory(buf: ArrayBuffer): Map<string, ZipEntry> {
  const dv = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This does not look like an Excel (.xlsx) file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, ZipEntry>();
  const dec = new TextDecoder('utf-8');
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.byteLength || dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.set(name, { name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function unpack(buf: ArrayBuffer, e: ZipEntry): Promise<Uint8Array> {
  const dv = new DataView(buf);
  if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('The Excel file is damaged.');
  const nameLen = dv.getUint16(e.offset + 26, true);
  const extraLen = dv.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const raw = new Uint8Array(buf, start, e.compSize);
  if (e.method === 0) return raw;
  if (e.method !== 8) throw new Error('The Excel file uses a compression this reader does not know.');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > LIMITS.maxXmlBytes) { await reader.cancel(); throw new Error('That Excel file is too large to read here.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

async function textOf(buf: ArrayBuffer, dir: Map<string, ZipEntry>, name: string): Promise<string | null> {
  const e = dir.get(name);
  if (!e) return null;
  return new TextDecoder('utf-8').decode(await unpack(buf, e));
}

// ------------------------------------------------------------------ xml bits

function unescapeXml(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, g: string) => {
    if (g[0] === '#') {
      const code = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return ''; }
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[g];
  });
}

function attrs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out[m[1]] = unescapeXml(m[2] ?? m[3] ?? '');
  return out;
}

function textRuns(xml: string): string {
  const noPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noPhonetic))) out += unescapeXml(m[1] ?? '');
  return out;
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ? textRuns(m[1]) : '');
  return out;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

export function isDateFormatCode(code: string): boolean {
  const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  return /[ymdhs]/i.test(c) && !/^general$/i.test(c.trim());
}

function parseDateStyles(xml: string | null): Set<number> {
  const dateXf = new Set<number>();
  if (!xml) return dateXf;
  const custom = new Map<number, string>();
  const nf = /<numFmt\b([^>]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = nf.exec(xml))) {
    const a = attrs(m[1]);
    if (a.numFmtId) custom.set(Number(a.numFmtId), a.formatCode || '');
  }
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!block) return dateXf;
  const xf = /<xf\b([^>]*?)(?:\/>|>)/g;
  let i = 0;
  while ((m = xf.exec(block[1]))) {
    const id = Number(attrs(m[1]).numFmtId || 0);
    const isDate = custom.has(id) ? isDateFormatCode(custom.get(id)!) : BUILTIN_DATE_FORMATS.has(id);
    if (isDate) dateXf.add(i);
    i++;
  }
  return dateXf;
}

export function excelSerialToText(serial: number, date1904: boolean): string {
  if (!Number.isFinite(serial)) return '';
  const whole = Math.floor(serial);
  const frac = serial - whole;
  // The 1900 system counts a day (29 Feb 1900) that never existed: serials below 61 are shifted by one.
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : serial < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const d = new Date(epoch + whole * 86400000);
  const iso = d.toISOString().slice(0, 10);
  if (frac < 1e-9) return iso;
  const secs = Math.round(frac * 86400);
  const hh = String(Math.floor(secs / 3600) % 24).padStart(2, '0');
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  return `${iso} ${hh}:${mm}`;
}

function colIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseSheet(xml: string, shared: string[], dateXf: Set<number>, date1904: boolean): { rows: string[][]; truncated: boolean } {
  const grid: string[][] = [];
  let truncated = false;
  let maxCol = 0;
  let rowCounter = 0;
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const ra = attrs(rm[1]);
    rowCounter = ra.r ? Number(ra.r) - 1 : rowCounter;
    const body = rm[2];
    if (!body) { rowCounter++; continue; }
    if (rowCounter >= LIMITS.maxRows) { truncated = true; break; }
    const cells: string[] = [];
    let colCounter = 0;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(body))) {
      const ca = attrs(cm[1]);
      const col = ca.r ? colIndex(ca.r) : colCounter;
      colCounter = col + 1;
      if (col >= LIMITS.maxCols) { truncated = true; continue; }
      const inner = cm[2] || '';
      let text = '';
      const t = ca.t || 'n';
      if (t === 'inlineStr') {
        text = textRuns(inner);
      } else {
        const v = /<v\b[^>]*?>([\s\S]*?)<\/v>/.exec(inner);
        const raw = v ? unescapeXml(v[1]) : '';
        if (t === 's') text = shared[Number(raw)] ?? '';
        else if (t === 'str' || t === 'd') text = raw;
        else if (t === 'b') text = raw === '1' ? 'TRUE' : raw === '' ? '' : 'FALSE';
        else if (t === 'e') text = '';
        else if (raw !== '' && ca.s !== undefined && dateXf.has(Number(ca.s))) text = excelSerialToText(Number(raw), date1904);
        else text = raw;
      }
      if (text !== '') {
        (cells[col] = text);
        if (col + 1 > maxCol) maxCol = col + 1;
      }
    }
    if (cells.length) grid[rowCounter] = cells;
    rowCounter++;
  }
  const rows: string[][] = [];
  for (let r = 0; r < grid.length; r++) {
    const src = grid[r];
    const row: string[] = new Array(maxCol).fill('');
    if (src) for (let c = 0; c < src.length; c++) if (src[c] !== undefined) row[c] = src[c];
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return { rows, truncated };
}

function resolveTarget(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = ('xl/' + target).split('/');
  const out: string[] = [];
  for (const p of parts) { if (p === '..') out.pop(); else if (p !== '.') out.push(p); }
  return out.join('/');
}

export async function readXlsx(buf: ArrayBuffer): Promise<RawSheet[]> {
  const dir = readZipDirectory(buf);
  const wbXml = await textOf(buf, dir, 'xl/workbook.xml');
  if (!wbXml) throw new Error('This does not look like an Excel (.xlsx) file.');
  const relsXml = (await textOf(buf, dir, 'xl/_rels/workbook.xml.rels')) || '';
  const rels = new Map<string, string>();
  const rr = /<Relationship\b([^>]*?)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = rr.exec(relsXml))) { const a = attrs(m[1]); if (a.Id && a.Target) rels.set(a.Id, a.Target); }
  const date1904 = /<workbookPr\b[^>]*date1904\s*=\s*"(?:1|true)"/.test(wbXml);
  const shared = parseSharedStrings(await textOf(buf, dir, 'xl/sharedStrings.xml'));
  const dateXf = parseDateStyles(await textOf(buf, dir, 'xl/styles.xml'));

  const sheets: RawSheet[] = [];
  const sr = /<sheet\b([^>]*?)\/?>/g;
  let n = 0;
  while ((m = sr.exec(wbXml))) {
    n++;
    const a = attrs(m[1]);
    const target = rels.get(a['r:id']) ? resolveTarget(rels.get(a['r:id'])!) : `xl/worksheets/sheet${n}.xml`;
    const xml = await textOf(buf, dir, target);
    if (xml === null) continue; // a chart sheet or a missing part: nothing to read
    const { rows, truncated } = parseSheet(xml, shared, dateXf, date1904);
    sheets.push({ name: a.name || `Sheet${n}`, hidden: a.state === 'hidden' || a.state === 'veryHidden', rows, truncated });
  }
  return sheets;
}

// ------------------------------------------------------------------ delimited text

function decodeText(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  const start = u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf ? 3 : 0;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8.subarray(start));
  } catch {
    return new TextDecoder('windows-1252').decode(u8.subarray(start));
  }
}

export function sniffDelimiter(text: string): string {
  const sample = text.slice(0, 20000);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const counts: number[] = [];
    let inQ = false, c = 0;
    for (let i = 0; i < sample.length && counts.length < 12; i++) {
      const ch = sample[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === d) c++;
      else if (!inQ && ch === '\n') { counts.push(c); c = 0; }
    }
    if (!counts.length) counts.push(c);
    const first = counts[0];
    if (first === 0) continue;
    const consistent = counts.filter((x) => x === first).length / counts.length;
    const score = consistent * 100 + first;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const width = Math.min(LIMITS.maxCols, rows.reduce((w, r) => Math.max(w, r.length), 0));
  const out = rows.slice(0, LIMITS.maxRows).map((r) => { const x = r.slice(0, width); while (x.length < width) x.push(''); return x; });
  while (out.length && out[out.length - 1].every((c) => c.trim() === '')) out.pop();
  return out;
}

// ------------------------------------------------------------------ entry point

export async function readWorkbookBuffer(buf: ArrayBuffer, fileName: string): Promise<RawSheet[]> {
  if (buf.byteLength > LIMITS.maxFileBytes) throw new Error('That file is larger than 60 MB. Split it into smaller files.');
  const head = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
  if (head[0] === 0x50 && head[1] === 0x4b) return readXlsx(buf);
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw new Error('This is an old Excel (.xls) file. Open it in Excel and use Save As > Excel Workbook (.xlsx) or CSV, then try again.');
  }
  const text = decodeText(buf);
  const rows = parseDelimited(text, sniffDelimiter(text));
  const base = fileName.replace(/\.[^.]+$/, '') || 'File';
  return [{ name: base, hidden: false, rows }];
}

export async function readWorkbookFile(file: File): Promise<RawSheet[]> {
  return readWorkbookBuffer(await file.arrayBuffer(), file.name);
}

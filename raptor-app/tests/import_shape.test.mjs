// Run with:  node --test tests/import_shape.test.mjs      (from raptor-app/)
// The Excel reader, header/sheet detection and column guessing, on files of SEVERAL different shapes built in the test itself
// (no network). If the owner's own sample files exist on this PC they are read (never written) as extra input, not as the rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { readWorkbookBuffer, readXlsx, parseDelimited, sniffDelimiter, excelSerialToText, isDateFormatCode } from '../src/lib/import/xlsxRead.ts';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { suggestMapping, suggestSetup, guessColumn, profileColumn, headerCandidates } from '../src/lib/import/columnGuess.ts';

// ---------------------------------------------------------------- a tiny xlsx writer (stored + deflate), for tests only
function crc32(buf) { let c, crc = ~0; for (let i = 0; i < buf.length; i++) { c = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content, deflate] of files) {
    const data = Buffer.from(content, 'utf8');
    const comp = deflate ? zlib.deflateRawSync(data) : data;
    const nameB = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(deflate ? 8 : 0, 8); lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameB.length, 26);
    locals.push(lh, nameB, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(deflate ? 8 : 0, 10); ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameB.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const all = Buffer.concat([...locals, cd, end]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const letter = (i) => String.fromCharCode(65 + i);
/** sheets: [{name, hidden?, rows: [[cell...]]}] where a cell is a string (shared string), number, {date: serial}, {inline: text}, null */
function makeXlsx(sheets, { date1904 = false, swapRels = false } = {}) {
  const shared = [];
  const sidx = (s) => { let i = shared.indexOf(s); if (i < 0) { shared.push(s); i = shared.length - 1; } return i; };
  const sheetXml = sheets.map((sh) => {
    const rows = sh.rows.map((row, r) => {
      const cells = row.map((v, c) => {
        if (v === null || v === undefined || v === '') return '';
        const ref = letter(c) + (r + 1);
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
        if (v && v.date !== undefined) return `<c r="${ref}" s="1"><v>${v.date}</v></c>`;
        if (v && v.inline !== undefined) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v.inline)}</t></is></c>`;
        return `<c r="${ref}" t="s"><v>${sidx(v)}</v></c>`;
      }).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : `<row r="${r + 1}"/>`;
    }).join('');
    return `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  });
  const files = [
    ['[Content_Types].xml', '<Types/>', true],
    ['xl/workbook.xml', `<workbook xmlns:r="x"><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`, true],
    ['xl/_rels/workbook.xml.rels', `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${swapRels ? sheets.length - i : i + 1}.xml" Type="x"/>`).join('')}</Relationships>`, true],
    ['xl/styles.xml', '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>', true],
    ...sheetXml.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x, i % 2 === 0]), // mix of deflated and stored parts
  ];
  files.push(['xl/sharedStrings.xml', `<sst>${shared.map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`, true]);
  return zip(files);
}

test('xlsx reader: shared and inline strings, numbers, dates, hidden sheets, escapes, stored and deflated parts', async () => {
  const buf = makeXlsx([
    { name: 'Leads & more', rows: [['Name', 'Phone', 'Joined', 'Note'], ['A <b> & C', 9876543210, { date: 46000 }, { inline: 'plain' }], [null, null, null, 'tail']] },
    { name: 'Hidden', hidden: true, rows: [['x']] },
  ]);
  const sheets = await readXlsx(buf);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[0].name, 'Leads & more');
  assert.equal(sheets[1].hidden, true);
  assert.deepEqual(sheets[0].rows[0], ['Name', 'Phone', 'Joined', 'Note']);
  assert.deepEqual(sheets[0].rows[1], ['A <b> & C', '9876543210', '2025-12-09', 'plain']);
  assert.deepEqual(sheets[0].rows[2], ['', '', '', 'tail']);
});

test('sheets are found through the relationships written in the workbook, not by file number', async () => {
  const buf = makeXlsx([{ name: 'First', rows: [['a1']] }, { name: 'Second', rows: [['b1']] }], { swapRels: true });
  const sheets = await readXlsx(buf);
  assert.deepEqual(sheets.map((s) => [s.name, s.rows[0][0]]), [['First', 'b1'], ['Second', 'a1']]);   // each name points at the part its relationship says
});

test('excel date serials: 1900 and 1904 systems, times, and which number formats are dates', () => {
  assert.equal(excelSerialToText(45292, false), '2024-01-01');
  assert.equal(excelSerialToText(44562, false), '2022-01-01');
  assert.equal(excelSerialToText(0, true), '1904-01-01');
  assert.equal(excelSerialToText(45292.5, false), '2024-01-01 12:00');
  assert.equal(isDateFormatCode('dd/mm/yyyy'), true);
  assert.equal(isDateFormatCode('[$-409]d-mmm-yy;@'), true);
  assert.equal(isDateFormatCode('0.00'), false);
  assert.equal(isDateFormatCode('#,##0 "days"'), false);
  assert.equal(isDateFormatCode('General'), false);
});

test('readers refuse what they cannot read, in plain words', async () => {
  await assert.rejects(() => readWorkbookBuffer(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]).buffer, 'old.xls'), /\.xls/);
  await assert.rejects(() => readXlsx(new Uint8Array(100).buffer), /Excel/);
});

test('text files: encodings and delimiters are detected', async () => {
  assert.equal(sniffDelimiter('a;b;c\n1;2;3\n'), ';');
  assert.equal(sniffDelimiter('a\tb\n1\t2\n'), '\t');
  assert.equal(sniffDelimiter('"a,b",c,d\n1,2,3\n'), ',');
  assert.deepEqual(parseDelimited('a,"b,1",c\n"x ""q""",2,3\n', ','), [['a', 'b,1', 'c'], ['x "q"', '2', '3']]);
  const semi = Buffer.from('\ufeffName;Email\nZoë;z@x.com\n', 'utf8');
  const [sheet] = await readWorkbookBuffer(semi.buffer.slice(semi.byteOffset, semi.byteOffset + semi.byteLength), 'people.csv');
  assert.deepEqual(sheet.rows, [['Name', 'Email'], ['Zoë', 'z@x.com']]);
  const latin = Buffer.from([0x4e, 0x61, 0x6d, 0x65, 0x0a, 0x4a, 0x6f, 0x73, 0xe9, 0x0a]); // "Name\nJosé" in windows-1252
  const [s2] = await readWorkbookBuffer(latin.buffer.slice(latin.byteOffset, latin.byteOffset + latin.byteLength), 'x.csv');
  assert.equal(s2.rows[1][0], 'José');
});

// ---------------------------------------------------------------- shapes
const company = (n) => [`Acme ${n} Pvt. Ltd.`, 'Pune', `Mr. Raj ${n}`, `info${n}@acme${n}.com`, '+91 98765 43210', `Plot ${n}, Industrial Area`, `https://www.acme${n}.com`];

test('a plain list: header on row 1', () => {
  const rows = [['Company', 'City', 'Contact Person', 'Email', 'Phone', 'Address', 'Website'], ...Array.from({ length: 12 }, (_, i) => company(i))];
  const t = analyseSheet('S', false, rows);
  assert.equal(t.headerRow, 1);
  assert.equal(t.rows.length, 12);
  assert.equal(t.verdict, 'list');
  const g = Object.fromEntries(suggestMapping(t).map((s) => [s.header, s.guess.field]));
  assert.deepEqual(g, { Company: 'company.name', City: 'company.city', 'Contact Person': 'contact.name', Email: 'company.email', Phone: 'company.phone', Address: 'company.address', Website: 'company.website_url' });
});

test('a title above the header, a blank first column and a row-number column', () => {
  const rows = [
    ['Q3 target accounts', '', '', ''],
    ['', '', '', ''],
    ['', '#', 'Org name', 'Sector', 'Mobile'],
    ...Array.from({ length: 8 }, (_, i) => ['', String(i + 1), `Zed ${i} LLC`, i % 2 ? 'Retail' : 'Logistics', `98765${String(10000 + i)}`]),
  ];
  const t = analyseSheet('S', false, rows);
  assert.equal(t.headerRow, 3);
  assert.deepEqual(t.columns.map((c) => c.header), ['#', 'Org name', 'Sector', 'Mobile']);
  const g = Object.fromEntries(suggestMapping(t).map((s) => [s.header, s.guess.field]));
  assert.equal(g['#'], 'ignore');
  assert.equal(g['Org name'], 'company.name');
  assert.equal(g.Sector, 'company.industry');
  assert.equal(g.Mobile, 'contact.phone');
});

test('a headerless row-number column is dropped; a numbered sheet keeps its names', () => {
  const rows = [[null, 'Startup Name', 'Target Customer Type', 'Notes'], ...Array.from({ length: 6 }, (_, i) => [String(i + 1), `Co ${i}`, 'Enterprise', 'x'])];
  const t = analyseSheet('S', false, rows);
  assert.deepEqual(t.columns.map((c) => c.header), ['Startup Name', 'Target Customer Type', 'Notes']);
  assert.equal(suggestMapping(t)[0].guess.field, 'company.name');
});

test('section lines and totals are set aside and reported, name-only rows are kept', () => {
  const rows = [['Name', 'Email', 'City'], ['A Corp', 'a@a.com', 'X'], ['Section 2: pasted rows', '', ''], ['B Corp', '', ''], ['Total', '', ''], ['C Corp', 'c@c.com', 'Y'], ['D Corp', '', 'Z'], ['E Corp', 'e@e.com', 'Y']];
  const t = analyseSheet('S', false, rows);
  assert.deepEqual(t.rows.map((r) => r[0]), ['A Corp', 'B Corp', 'C Corp', 'D Corp', 'E Corp']);
  assert.equal(t.skipped.length, 2);
});

test('duplicate headers are made unique; blank headers get a letter', () => {
  const t = analyseSheet('S', false, [['Name', 'Name', '', 'Email'], ['a', 'b', 'c', 'a@a.com'], ['d', 'e', 'f', 'd@d.com'], ['g', 'h', 'i', 'g@g.com'], ['j', 'k', 'l', 'j@j.com'], ['m', 'n', 'o', 'm@m.com']]);
  assert.deepEqual(t.columns.map((c) => c.header), ['Name', 'Name (2)', 'Column C', 'Email']);
});

test('small and empty sheets are not offered as lists', () => {
  assert.equal(analyseSheet('E', false, [['', ''], ['', '']]).verdict, 'not_a_table');
  assert.equal(analyseSheet('S', false, [['Segment', 'Count'], ['A', '1'], ['B', '2']]).verdict, 'small');
});

test('a deals sheet and a split-name contacts sheet', () => {
  const deals = [['Opportunity', 'Amount', 'Stage', 'Meeting'], ...Array.from({ length: 6 }, (_, i) => [`Deal ${i}`, `$${(i + 1) * 1000}`, ['Lead', 'Won', 'Lost'][i % 3], `0${i + 1}/0${i + 1}/2026`])];
  const g = Object.fromEntries(suggestMapping(analyseSheet('D', false, deals)).map((s) => [s.header, s.guess.field]));
  assert.deepEqual(g, { Opportunity: 'deal.title', Amount: 'deal.value', Stage: 'deal.stage', Meeting: 'deal.meeting_at' });
  const people = [['First Name', 'Last Name', 'Job Title', 'Work Email', 'LinkedIn'], ...Array.from({ length: 6 }, (_, i) => [`F${i}`, `L${i}`, 'Manager', `f${i}@x.com`, `https://linkedin.com/in/f${i}`])];
  const p = Object.fromEntries(suggestMapping(analyseSheet('P', false, people)).map((s) => [s.header, s.guess.field]));
  assert.deepEqual(p, { 'First Name': 'contact.first_name', 'Last Name': 'contact.last_name', 'Job Title': 'contact.role', 'Work Email': 'contact.email', LinkedIn: 'contact.linkedin_url' });
});

test('header and values must agree: a "phone" column of emails is an email column; a label column is not a description', () => {
  const emails = profileColumn(Array.from({ length: 10 }, (_, i) => `p${i}@x.com`));
  assert.equal(guessColumn('Contact Number', emails).field, 'company.email');
  const labels = profileColumn(Array.from({ length: 30 }, (_, i) => ['Short', 'Long', 'Medium'][i % 3]));
  assert.equal(guessColumn('Details', labels).field, 'custom');
  const broken = profileColumn(Array.from({ length: 10 }, (_, i) => `-6579${i}813.19`));
  const g = guessColumn('Phone', broken);
  assert.equal(g.confidence, 'low');
  assert.match(g.reason, /damaged|not usable/);
});

test('two columns never claim the same single field; the weaker becomes a custom field', () => {
  const rows = [['Company Name', 'Company', 'Email'], ...Array.from({ length: 6 }, (_, i) => [`Acme ${i}`, i < 2 ? `Acme ${i}` : '', `a${i}@a.com`])];
  const m = suggestMapping(analyseSheet('S', false, rows));
  assert.equal(m.filter((s) => s.guess.field === 'company.name').length, 1);
  assert.equal(m[0].guess.field, 'company.name');
  assert.equal(m[1].guess.field, 'custom');
});

test('header words are matched as whole words, in any order and plural', () => {
  assert.equal(headerCandidates('E-mail address')[0].field, 'company.email');
  assert.equal(headerCandidates('Emails')[0].field, 'company.email');
  assert.equal(headerCandidates('Verified Address (Web search)')[0].field, 'company.address');
  assert.equal(headerCandidates('Address Status').length === 0 || headerCandidates('Address Status')[0].field !== 'company.address', true);
  assert.equal(headerCandidates('Source URL(s)').some((c) => c.field === 'company.website_url'), false);
});

// ---------------------------------------------------------------- the owner's own files, if present: extra input only
const OWNER = ['C:/Users/Asus/Desktop/raptor  kampany list - verified.xlsx', 'C:/Users/Asus/Downloads/Pune_Startups_Master_200.xlsx', 'C:/Users/Asus/Desktop/Book1.xlsx'];
test('the owner\'s files (when on this PC) are read and every list sheet has a company-name column', async (t) => {
  if (!OWNER.every((f) => fs.existsSync(f))) return t.skip('sample files not on this PC');
  for (const f of OWNER) {
    const b = fs.readFileSync(f);
    const sheets = await readWorkbookBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), f);
    const tables = sheets.map((s) => analyseSheet(s.name, s.hidden, s.rows));
    const lists = tables.filter((x) => x.verdict === 'list');
    assert.ok(lists.length >= 1, f);
    for (const tb of lists) {
      if (/Summary|Duplicates/.test(tb.name)) continue;
      const fields = suggestMapping(tb).map((s) => s.guess.field);
      assert.ok(fields.includes('company.name'), `${f} / ${tb.name}: ${fields.join(',')}`);
    }
  }
});

test('a plain Email/Phone belongs to what a row IS: the company in a company list, the person in a people list or a deal list that names a person', () => {
  const company = analyseSheet('C', false, [['Company', 'Email', 'Phone'], ...Array.from({ length: 6 }, (_, i) => [`Co ${i}`, `i${i}@c${i}.com`, `9876${i}00000`])]);
  const c = suggestSetup(company);
  assert.equal(c.rowKind, 'company');
  assert.deepEqual(c.suggestions.map((s) => s.guess.field), ['company.name', 'company.email', 'company.phone']);
  const people = analyseSheet('P', false, [['Name', 'Company', 'Email', 'Phone'], ...Array.from({ length: 8 }, (_, i) => [`${['Ann','Bob','Cleo','Dev','Eli','Fay','Gus','Hal'][i]} Roy`, `Co ${i % 2}`, `a${i}@c.com`, `9876${i}00000`])]);
  const p = suggestSetup(people);
  assert.equal(p.rowKind, 'contact');
  assert.deepEqual(p.suggestions.map((s) => s.guess.field), ['contact.name', 'company.name', 'contact.email', 'contact.phone']);
  const deals = analyseSheet('D', false, [['Opportunity', 'Account', 'Contact Person', 'Email'], ...Array.from({ length: 6 }, (_, i) => [`Deal ${i}`, `Co ${i}`, `${['Ann','Bob','Cleo','Dev','Eli','Fay'][i]} Roy`, `a${i}@c.com`])]);
  const d = suggestSetup(deals);
  assert.equal(d.rowKind, 'deal');
  assert.equal(d.suggestions[3].guess.field, 'contact.email');
  const kampany = analyseSheet('K', false, [['Company Name', 'HR Name', 'Email'], ['A Co', 'Ann Roy', 'a@a.com'], ['B Co', '', 'b@b.com'], ['C Co', '', 'c@c.com'], ['D Co', '', 'd@d.com'], ['E Co', '', 'e@e.com']]);
  assert.equal(suggestSetup(kampany).rowKind, 'company');
});

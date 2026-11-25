// Run with:  node --test tests/import_types.test.mjs      (from raptor-app/)
// Typed custom fields in the import: the suggestion from the values, the conversion, the creation with the right type, and the saved mapping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { suggestMapping, suggestFieldType, profileColumn } from '../src/lib/import/columnGuess.ts';
import { parseTables, planImport, convertCustom } from '../src/lib/import/plan.ts';
import { runImport } from '../src/lib/import/run.ts';
import { buildSaved, findSaved, applySaved } from '../src/lib/import/savedMappings.ts';

const col = (values) => profileColumn(values.map(String));
const OPTS = { dateOrder: 'dmy', extraPlaceholders: new Set(), stageMap: {}, stageKeys: new Set(['lead']), defaultStage: 'lead' };
const emptyExisting = () => ({ companies: [], contacts: [], deals: [], dossiers: [], defs: { company: new Map(), contact: new Map(), deal: new Map() } });

test('a column of numbers is a number field, of dates a date field, of a few repeated labels a dropdown, anything else text', () => {
  assert.equal(suggestFieldType(col(['12', '40', '7', '1,500', '9'])).type, 'number');
  assert.equal(suggestFieldType(col(['2026-01-02', '2026-03-04', '2025-12-31', '2026-05-06'])).type, 'date');
  const labels = suggestFieldType(col(['1-2 Months', '3-6 Months', '1-2 Months', '3-6 Months', '1-2 Months', '3-6 Months', '1-2 Months', '3-6 Months']));
  assert.equal(labels.type, 'select');
  assert.deepEqual([...labels.options].sort(), ['1-2 Months', '3-6 Months']);
  assert.equal(suggestFieldType(col(['alpha one', 'beta two', 'gamma three', 'delta four', 'epsilon five', 'zeta six', 'eta seven', 'theta eight'])).type, 'text');
});

test('what must stay text: phones, emails, addresses, row numbers, too few values, long free text', () => {
  assert.equal(suggestFieldType(col(['9876543210', '9876543211', '9876543212', '9876543213'])).type, 'text');
  assert.equal(suggestFieldType(col(['a@x.com', 'b@y.com', 'c@z.com', 'd@w.com'])).type, 'text');
  assert.equal(suggestFieldType(col(['1', '2', '3', '4', '5', '6'])).type, 'text');
  assert.equal(suggestFieldType(col(['5', '6'])).type, 'text');
  assert.equal(suggestFieldType(col(Array.from({ length: 12 }, (_, i) => 'x'.repeat(60) + (i % 2)))).type, 'text');
  assert.equal(suggestFieldType(col(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'])).type, 'text');    // 14 different values: too many for a dropdown
});

test('the suggestion rides along with every column guess', () => {
  const rows = [['Company', 'Employees', 'Cycle'], ...Array.from({ length: 8 }, (_, i) => [`Co ${i}`, String([120, 45, 300, 12, 80, 61, 9, 230][i]), i % 2 ? 'Short' : 'Long'])];
  const sug = suggestMapping(analyseSheet('S', false, rows));
  assert.equal(sug.find((s) => s.header === 'Employees').fieldType.type, 'number');
  assert.equal(sug.find((s) => s.header === 'Cycle').fieldType.type, 'select');
});

test('converting a cell to the field\'s type: numbers, dates, and a value that does not fit is left out and said so', () => {
  assert.deepEqual(convertCustom('number', '$12,500', 'dmy', 'Budget'), { value: '12500' });
  assert.match(convertCustom('number', 'lots', 'dmy', 'Budget').message, /"Budget" left out/);
  assert.equal(convertCustom('number', 'lots', 'dmy', 'Budget').value, undefined);
  assert.deepEqual(convertCustom('date', '31/12/2026', 'dmy', 'Renewal'), { value: '2026-12-31' });
  assert.deepEqual(convertCustom('date', '03/04/2026', 'mdy', 'Renewal'), { value: '2026-03-04' });
  assert.match(convertCustom('date', '03/04/2026', 'ambiguous', 'Renewal').message, /day-first or month-first/);
  assert.match(convertCustom('date', 'soon', 'dmy', 'Renewal').message, /left out/);
  assert.deepEqual(convertCustom('text', 'anything', 'dmy', 'Note'), { value: 'anything' });
  assert.deepEqual(convertCustom('select', 'Long', 'dmy', 'Cycle'), { value: 'Long' });
});

function plan(rows, choiceFor) {
  const table = analyseSheet('S', false, rows);
  const choices = table.columns.map((c, i) => (i === 0 ? { field: 'company.name' } : { field: 'custom', customEntity: 'company', customName: c.header, ...choiceFor(c.header) }));
  const parsed = parseTables([{ table, choices, rowKind: 'company' }], OPTS);
  return { parsed, plan: planImport(parsed, emptyExisting(), {}, (() => { let n = 0; return () => `id${++n}`; })()) };
}

const ROWS = [['Company', 'Employees', 'Renewal', 'Cycle'],
  ['A', '120', '31/12/2026', 'Long'], ['B', '40', '15/01/2027', 'Short'], ['C', 'many', 'next year', 'Long'], ['D', '5', '', 'Short'], ['E', '9', '01/02/2027', 'Long']];
const TYPES = { Employees: { customType: 'number' }, Renewal: { customType: 'date' }, Cycle: { customType: 'select', customOptions: ['Long', 'Short'] } };

test('typed columns give typed values, fields are announced with their type and dropdown choices, bad cells are reported and left out', () => {
  const { parsed, plan: p } = plan(ROWS, (h) => TYPES[h]);
  const byName = Object.fromEntries(p.newCustomFields.map((f) => [f.name, f]));
  assert.deepEqual([byName.Employees.type, byName.Renewal.type, byName.Cycle.type], ['number', 'date', 'select']);
  assert.deepEqual(byName.Cycle.options, ['Long', 'Short']);
  assert.equal(byName.Employees.options, null);
  const a = parsed.companies.get('a');
  assert.deepEqual([a.custom.Employees, a.custom.Renewal, a.custom.Cycle], ['120', '2026-12-31', 'Long']);
  const c = parsed.companies.get('c');
  assert.equal(c.custom.Employees, undefined);
  assert.equal(c.custom.Renewal, undefined);
  assert.equal(c.custom.Cycle, 'Long');
  const notes = parsed.outcomes.find((o) => o.row === 4).messages.join(' | ');       // sheet row 4 is company C
  assert.match(notes, /"Employees" left out/);
  assert.match(notes, /"Renewal" left out/);
});

test('without a chosen type every field is text, as before', () => {
  const { plan: p } = plan(ROWS, () => ({}));
  assert.ok(p.newCustomFields.every((f) => f.type === 'text' && f.options === null));
});

test('the runner creates each field with its type and choices', async () => {
  const { plan: p } = plan(ROWS, (h) => TYPES[h]);
  const defs = [];
  const db = {
    rpc: async (fn) => ({ data: fn === 'crm_import_begin' ? 'b1' : null, error: null }),
    from: (table) => ({
      insert: (rows) => {
        const list = [].concat(rows);
        if (table === 'custom_field_defs') defs.push(...list);
        const pr = Promise.resolve({ error: null });
        pr.select = () => ({ single: async () => ({ data: { id: 'def' + defs.length }, error: null }) });
        return pr;
      },
    }),
  };
  await runImport(p, emptyExisting(), { source: 's', fileName: 'f' }, db);
  const d = Object.fromEntries(defs.map((x) => [x.name, x]));
  assert.deepEqual([d.Employees.field_type, d.Renewal.field_type, d.Cycle.field_type], ['number', 'date', 'select']);
  assert.deepEqual(d.Cycle.options, ['Long', 'Short']);
  assert.equal(d.Employees.options, null);
});

test('the chosen type is remembered with the mapping and used for the next file', () => {
  const headers = ['Company', 'Employees', 'Cycle'];
  const choices = [{ field: 'company.name' }, { field: 'custom', customEntity: 'company', customName: 'Employees', customType: 'number' }, { field: 'custom', customEntity: 'company', customName: 'Cycle', customType: 'select', customOptions: ['Long', 'Short'] }];
  const saved = buildSaved(headers, choices, 'company', {}, '', '2026-11-26T00:00:00Z');
  const applied = applySaved(findSaved([saved], headers), headers);
  assert.equal(applied[1].customType, 'number');
  assert.deepEqual(applied[2].customOptions, ['Long', 'Short']);
});

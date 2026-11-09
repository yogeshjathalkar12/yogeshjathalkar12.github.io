// Run with:  node --test tests/import_run.test.mjs      (from raptor-app/)
// The import RUNNER with a fake database: order of writes, the batch tag on everything created, chunking, one bad row not sinking
// the rest, custom fields, Stop, errors, and that the batch is ALWAYS closed. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { suggestSetup } from '../src/lib/import/columnGuess.ts';
import { parseTables, planImport } from '../src/lib/import/plan.ts';
import { runImport, loadExisting, runUndo } from '../src/lib/import/run.ts';

const OPTS = { dateOrder: 'ambiguous', extraPlaceholders: new Set(), stageMap: {}, stageKeys: new Set(['lead', 'won']), defaultStage: 'lead' };
const emptyExisting = () => ({ companies: [], contacts: [], deals: [], defs: { company: new Map(), contact: new Map(), deal: new Map() } });
let n = 0;
const ids = () => `id-${++n}`;

function planFrom(rows, existing = emptyExisting(), overrides = {}) {
  const table = analyseSheet('S', false, rows);
  const { suggestions, rowKind } = suggestSetup(table);
  const choices = suggestions.map((s) => ({ field: overrides[s.header] ?? s.guess.field }));
  return planImport(parseTables([{ table, choices, rowKind }], OPTS), existing, {}, ids);
}

function fakeDb({ failNames = new Set(), failDefs = null, updateError = false, throwOnTable = null } = {}) {
  const log = [];
  const tables = { companies: [], contacts: [], deals: [], custom_field_defs: [] };
  let defSeq = 0;
  const insertInto = (table, rows) => {
    const list = Array.isArray(rows) ? rows : [rows];
    if (throwOnTable === table) throw new Error('network down');
    if (list.some((r) => failNames.has(r.name || r.title))) return { error: { message: 'row rejected' } };
    tables[table].push(...list);
    log.push(['insert', table, list.length]);
    return { error: null };
  };
  return {
    log, tables,
    rpc: async (fn, args) => {
      log.push(['rpc', fn]);
      if (fn === 'crm_import_begin') return { data: 'batch-1', error: null };
      if (fn === 'crm_import_finish') { log.push(['finish', args.p_counts]); return { data: null, error: null }; }
      if (fn === 'crm_import_apply_update') { log.push(['update', args]); return updateError ? { data: null, error: { message: 'cannot change' } } : { data: { applied: Object.keys(args.p_patch), skipped: [] }, error: null }; }
      if (fn === 'crm_import_undo') { log.push(['undo']); const k = log.filter((l) => l[0] === 'undo').length; return { data: k < 3 ? { done: false } : { done: true, status: 'undone' }, error: null }; }
      return { data: null, error: { message: 'unknown rpc' } };
    },
    from: (table) => ({
      insert: (rows) => {
        const r = table === 'custom_field_defs' && failDefs ? { error: failDefs } : insertInto(table, rows);
        const p = Promise.resolve(r);
        p.select = () => ({ single: async () => {
          if (table === 'custom_field_defs' && !r.error) { const row = tables.custom_field_defs[tables.custom_field_defs.length - 1]; row.id = `def-${++defSeq}`; return { data: { id: row.id }, error: null }; }
          return { data: null, error: r.error };
        } });
        return p;
      },
    }),
  };
}

const COMPANIES = [['Company', 'City', 'Contact', 'Email'],
  ['Alpha Ltd', 'Pune', 'Mr. Ravi Kumar (CEO)', 'ravi@alpha.com'], ['Beta Inc', 'Delhi', '', ''], ['Gamma LLC', 'Goa', '', ''], ['Delta Co', 'Goa', '', ''], ['Epsilon', 'Goa', '', '']];

test('a run creates parents before children, tags everything with the batch, and closes the batch with the counts', async () => {
  const db = fakeDb();
  const plan = planFrom(COMPANIES, emptyExisting(), { Contact: 'contact.name', Email: 'contact.email' });
  const res = await runImport(plan, emptyExisting(), { source: 'Test', fileName: 'x.xlsx' }, db);
  assert.equal(res.batchId, 'batch-1');
  assert.deepEqual(res.created, { companies: 5, contacts: 1, deals: 0, prospects: 0 });
  assert.equal(res.failed.length, 0);
  const order = db.log.filter((l) => ['rpc', 'insert'].includes(l[0])).map((l) => (l[0] === 'rpc' ? l[1] : l[1]));
  assert.ok(order.indexOf('crm_import_begin') < order.indexOf('companies'));       // the batch exists before anything is written
  assert.ok(order.indexOf('companies') < order.indexOf('contacts'));
  assert.equal(order[order.length - 1], 'crm_import_finish');
  for (const t of ['companies', 'contacts']) for (const r of db.tables[t]) assert.equal(r.import_batch_id, 'batch-1');
  const contact = db.tables.contacts[0];
  assert.equal(contact.name, 'Ravi Kumar');
  assert.equal(contact.company_id, db.tables.companies.find((c) => c.name === 'Alpha Ltd').id);
  const fin = db.log.find((l) => l[0] === 'finish')[1];
  assert.equal(fin.created.companies, 5);
  assert.equal(fin.stopped, false);
});

test('rows are inserted in chunks', async () => {
  const db = fakeDb();
  const rows = [['Company', 'City'], ...Array.from({ length: 10 }, (_, i) => [`Co ${i}`, 'x'])];
  await runImport(planFrom(rows), emptyExisting(), { source: 's', fileName: 'f', chunkSize: 3 }, db);
  assert.deepEqual(db.log.filter((l) => l[0] === 'insert' && l[1] === 'companies').map((l) => l[2]), [3, 3, 3, 1]);
});

test('one rejected row does not sink its chunk; the failure is reported; its contact is kept without the company', async () => {
  const db = fakeDb({ failNames: new Set(['Alpha Ltd']) });
  const plan = planFrom(COMPANIES, emptyExisting(), { Contact: 'contact.name', Email: 'contact.email' });
  const res = await runImport(plan, emptyExisting(), { source: 's', fileName: 'f', chunkSize: 10 }, db);
  assert.equal(res.created.companies, 4);
  assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].name, 'Alpha Ltd');
  assert.equal(res.created.contacts, 1);
  assert.equal(db.tables.contacts[0].company_id, undefined);
  assert.ok(db.log.some((l) => l[0] === 'finish'));
});

test('custom fields are created first and the values are stored under their ids', async () => {
  const db = fakeDb();
  const rows = [['Company', 'Sales Cycle'], ...Array.from({ length: 5 }, (_, i) => [`Co ${i}`, '3-6 months'])];
  const plan = planFrom(rows);
  assert.deepEqual(plan.newCustomFields, [{ entity: 'company', name: 'Sales Cycle' }]);
  const res = await runImport(plan, emptyExisting(), { source: 's', fileName: 'f' }, db);
  assert.equal(res.customFieldsCreated, 1);
  const defId = db.tables.custom_field_defs[0].id;
  assert.equal(db.tables.custom_field_defs[0].entity_type, 'company');
  assert.deepEqual(db.tables.companies[0].custom_fields, { [defId]: '3-6 months' });
  assert.ok(db.log.findIndex((l) => l[1] === 'custom_field_defs') < db.log.findIndex((l) => l[1] === 'crm_import_begin'));
});

test('if custom fields may not be created, NOTHING is written and no batch is started', async () => {
  const db = fakeDb({ failDefs: { code: '42501', message: 'denied' } });
  const rows = [['Company', 'Sales Cycle'], ...Array.from({ length: 5 }, (_, i) => [`Co ${i}`, 'x'])];
  await assert.rejects(() => runImport(planFrom(rows), emptyExisting(), { source: 's', fileName: 'f' }, db), /may not create custom fields/);
  assert.equal(db.log.some((l) => l[1] === 'crm_import_begin'), false);
  assert.equal(db.tables.companies.length, 0);
});

test('existing records are updated through crm_import_apply_update, empty fields only, custom keys resolved to ids', async () => {
  const db = fakeDb();
  const existing = emptyExisting();
  existing.companies = [{ id: 'c1', name: 'Alpha Ltd', website_url: null, phone: null, email: null, address: null, city: null, industry: null, description: null, custom_fields: null }];
  existing.defs.company.set('sales cycle', 'def-existing');
  const rows = [['Company', 'City', 'Sales Cycle', 'Notes'], ['Alpha', 'Pune', '1-2 months', 'hello'], ...Array.from({ length: 4 }, (_, i) => [`Co ${i}`, 'x', 'y', 'z'])];
  const plan = planFrom(rows, existing);
  const res = await runImport(plan, existing, { source: 's', fileName: 'f' }, db);
  const upd = db.log.find((l) => l[0] === 'update')[1];
  assert.equal(upd.p_table, 'companies');
  assert.equal(upd.p_id, 'c1');
  assert.equal(upd.p_only_empty, true);
  assert.equal(upd.p_patch.city, 'Pune');
  assert.equal(upd.p_patch['cf:def-existing'], '1-2 months');
  assert.ok(Object.keys(upd.p_patch).some((k) => k.startsWith('cf:') && k !== 'cf:def-existing'), 'the new Notes field is resolved too');
  assert.ok(!Object.keys(upd.p_patch).some((k) => k.startsWith('cfnew')));
  assert.equal(res.updated.companies, 1);
  assert.equal(res.created.companies, 4);
});

test('an update the database refuses is reported, the rest continue', async () => {
  const db = fakeDb({ updateError: true });
  const existing = emptyExisting();
  existing.companies = [{ id: 'c1', name: 'Alpha', website_url: null, phone: null, email: null, address: null, city: null, industry: null, description: null, custom_fields: null }];
  const rows = [['Company', 'City'], ['Alpha', 'Pune'], ...Array.from({ length: 4 }, (_, i) => [`Co ${i}`, 'x'])];
  const res = await runImport(planFrom(rows, existing), existing, { source: 's', fileName: 'f' }, db);
  assert.equal(res.failed.length, 1);
  assert.match(res.failed[0].message, /cannot change/);
  assert.equal(res.created.companies, 4);
});

test('Stop ends the run cleanly: the batch is closed (so it can be undone) and says it was stopped', async () => {
  const db = fakeDb();
  const rows = [['Company', 'City'], ...Array.from({ length: 10 }, (_, i) => [`Co ${i}`, 'x'])];
  let calls = 0;
  const res = await runImport(planFrom(rows), emptyExisting(), { source: 's', fileName: 'f', chunkSize: 3, shouldStop: () => ++calls > 2 }, db);
  assert.equal(res.stopped, true);
  assert.equal(res.created.companies, 6);
  const fin = db.log.find((l) => l[0] === 'finish')[1];
  assert.equal(fin.stopped, true);
  assert.equal(fin.created.companies, 6);
});

test('an unexpected error in the middle still closes the batch', async () => {
  const db = fakeDb({ throwOnTable: 'contacts' });
  const plan = planFrom(COMPANIES, emptyExisting(), { Contact: 'contact.name', Email: 'contact.email' });
  const res = await runImport(plan, emptyExisting(), { source: 's', fileName: 'f' }, db);
  assert.equal(res.created.companies, 5);
  assert.ok(res.failed.some((f) => /network down/.test(f.message)));
  assert.equal(res.stopped, true);
  assert.ok(db.log.some((l) => l[0] === 'finish'));
});

test('undo asks again until the database says it is done', async () => {
  const db = fakeDb();
  const rounds = [];
  const res = await runUndo('batch-1', false, (r) => rounds.push(r), db);
  assert.equal(res.done, true);
  assert.equal(rounds.length, 3);
});

test('loading what exists reads every page, not just the first 1000', async () => {
  const pages = { companies: 2300, contacts: 5, deals: 0, custom_field_defs: 1 };
  const client = { rpc: async () => ({}), from: (table) => ({ select: () => ({ order: () => ({ range: async (a, b) => ({ data: Array.from({ length: Math.max(0, Math.min(b + 1, pages[table]) - a) }, (_, i) => ({ id: `${table}${a + i}`, entity_type: 'deal', name: 'F' })), error: null }) }) }) }) };
  const ex = await loadExisting(client);
  assert.equal(ex.companies.length, 2300);
  assert.equal(ex.contacts.length, 5);
  assert.equal(ex.defs.deal.get('f'), 'custom_field_defs0');
});

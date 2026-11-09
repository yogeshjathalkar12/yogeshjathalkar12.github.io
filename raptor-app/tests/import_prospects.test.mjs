// Run with:  node --test tests/import_prospects.test.mjs      (from raptor-app/)
// "Companies go to both places": the prospect key must be EXACTLY the desktop engine's (checked against the Python original), the plan decides who
// becomes a prospect, and the runner adds them as part of the same batch. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { suggestSetup } from '../src/lib/import/columnGuess.ts';
import { parseTables, planImport } from '../src/lib/import/plan.ts';
import { runImport } from '../src/lib/import/run.ts';
import { bookDomain, bookNormalizeName, canonicalKey, allKeys, buildProspectRow } from '../src/lib/import/prospects.ts';

const BOOK_PY = 'C:/Users/Asus/Desktop/shoonya origins tech/Raptor B2B/raptor/prospects/book.py';

const URLS = ['https://www.shop.acme.co.in/about', 'acme.com', 'ACME.COM/Contact?x=1', 'http://acme.co.uk', 'https://sub.domain.example.org/a/b', 'localhost', '10.0.0.1', 'http://[::1]:8080/x',
  '', '   ', 'not a url', 'www.linkedin.com/company/acme', 'https://indiamart.com/acme', 'acme.com.au', 'x.co.th', 'https://acme.in:8443/p', 'foo..bar.com', '.acme.com.', 'acme', 'https://www2.acme.com'];
const NAMES = ['Acme Pvt. Ltd.', 'ACME', 'The Acme Company', 'Müller GmbH', 'Ltd', '', 'Tata & Sons Ltd', 'KION India Private Limited', 'sumax enterprises', '  Xpressbee  Tech Hub ', 'A.B.C. Inc', 'Acme-Corp (Pune)', '123 Co', 'Ünïcode Name'];
const IDENTITIES = [
  { url: 'https://www.acme.in', company_name: 'Acme' }, { company_name: 'Acme Pvt Ltd' }, { url: 'https://linkedin.com/company/acme', company_name: 'Acme' },
  { url: 'https://acme.com', company_name: 'Acme', target_type: 'person' }, { display_name: 'Display Co', company_name: 'Other' }, { website: 'x.co.in', company_name: '' }, {}, { url: '', company_name: 'Ltd' },
];

test('the prospect key is exactly the desktop engine\'s (checked against book.py itself)', (t) => {
  if (!fs.existsSync(BOOK_PY)) return t.skip('book.py not on this PC');
  const code = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('book', sys.argv[1]); book = importlib.util.module_from_spec(spec); spec.loader.exec_module(book)
d = json.loads(sys.argv[2])
print(json.dumps({'domains': [book.registrable_domain(u) for u in d['urls']], 'names': [book.normalize_name(n) for n in d['names']], 'keys': [book.canonical_key(i) for i in d['identities']]}))`;
  const py = JSON.parse(execFileSync('python', ['-c', code, BOOK_PY, JSON.stringify({ urls: URLS, names: NAMES, identities: IDENTITIES })], { encoding: 'utf8' }));
  assert.deepEqual(URLS.map(bookDomain), py.domains, 'registrable domains');
  assert.deepEqual(NAMES.map(bookNormalizeName), py.names, 'normalised names');
  assert.deepEqual(IDENTITIES.map(canonicalKey), py.keys, 'canonical keys');
});

test('keys: the same company under different spellings shares a key, a hosting site is never a company\'s identity', () => {
  assert.equal(canonicalKey({ url: 'https://www.acme.in', company_name: 'Acme' }), 'd:acme.in');
  assert.equal(canonicalKey({ company_name: 'Acme Pvt. Ltd.' }), canonicalKey({ company_name: 'ACME' }));
  assert.equal(canonicalKey({ url: 'https://linkedin.com/company/acme', company_name: 'Acme' }), 'n:acme');
  assert.deepEqual(allKeys({ url: 'https://acme.in', company_name: 'Acme Pvt Ltd' }, 'Acme Pvt Ltd'), ['d:acme.in', 'n:acme']);
});

// ---------------------------------------------------------------- plan
const OPTS = { dateOrder: 'ambiguous', extraPlaceholders: new Set(), stageMap: {}, stageKeys: new Set(['lead']), defaultStage: 'lead' };
const emptyExisting = () => ({ companies: [], contacts: [], deals: [], dossiers: [], defs: { company: new Map(), contact: new Map(), deal: new Map() } });
let n = 0;
const ids = () => `id-${++n}`;
const ex = (o) => ({ id: o.id, name: o.name, website_url: null, phone: null, email: null, address: null, city: null, industry: null, description: null, custom_fields: null, created_at: '2026-01-01', ...o });

function parsed(rows, overrides = {}) {
  const table = analyseSheet('S', false, rows);
  const { suggestions, rowKind } = suggestSetup(table);
  return parseTables([{ table, choices: suggestions.map((s) => ({ field: overrides[s.header] ?? s.guess.field })), rowKind }], OPTS);
}
const ROWS = [['Company', 'Website', 'Email', 'Phone', 'Address', 'City', 'HR Name'],
  ['Alpha Pvt. Ltd.', 'www.alpha.example', 'info@alpha.example; hr@alpha.example', '+91 98765 43210', 'Plot 1', 'Pune', 'Mr. Ravi Kumar (CEO)'],
  ['Beta Inc', '', '', '9876501234', '', '', ''], ['Gamma LLC', 'gamma.example', '', '', '', 'Goa', ''], ['Delta', 'delta.example', '', '', '', '', ''], ['Eps', '', '', '', '', '', '']];

test('without the switch nothing becomes a prospect', () => {
  const plan = planImport(parsed(ROWS), emptyExisting(), {}, ids);
  assert.equal(plan.prospects.create.length, 0);
});

test('with the switch every new company becomes a prospect, linked to its CRM company and carrying its people', () => {
  const plan = planImport(parsed(ROWS, { 'HR Name': 'contact.name' }), emptyExisting(), {}, ids, { prospects: true });
  assert.equal(plan.prospects.create.length, 5);
  const alpha = plan.prospects.create.find((p) => p.entityName === 'Alpha Pvt. Ltd.');
  assert.equal(alpha.companyId, plan.companies.create.find((c) => c.rec.name === 'Alpha Pvt. Ltd.').id);
  assert.deepEqual(alpha.contacts.map((c) => c.name), ['Ravi Kumar']);
});

test('a company already in the prospect book is left alone: by website, by name spelling, or because a prospect points at its CRM company', () => {
  const e = emptyExisting();
  e.companies = [ex({ id: 'c-eps', name: 'Eps' })];
  e.dossiers = [
    { id: 'd1', entity_name: 'Alpha Industries', company_key: 'd:alpha.example', company_id: null },     // same website, other name
    { id: 'd2', entity_name: 'BETA', company_key: 'n:beta', company_id: null },                         // same name without "Inc"
    { id: 'd3', entity_name: 'Something Else', company_key: 'n:something else', company_id: 'c-eps' },   // points at the CRM company the file row matches
  ];
  const plan = planImport(parsed(ROWS), e, {}, ids, { prospects: true });
  assert.deepEqual(plan.prospects.create.map((p) => p.entityName).sort(), ['Delta', 'Gamma LLC']);
  assert.equal(plan.prospects.alreadyThere, 3);
});

test('two companies of one file that share a website make ONE prospect; the other is reported, not lost', () => {
  const rows = [['Company', 'Website'], ['Holding A', 'group.example'], ['Holding B', 'www.group.example/about'], ['C', 'c.example'], ['D', 'd.example'], ['E', 'e.example']];
  const plan = planImport(parsed(rows), emptyExisting(), {}, ids, { prospects: true });
  assert.equal(plan.prospects.create.length, 4);
  assert.equal(plan.prospects.sharedSite, 1);
  assert.equal(plan.companies.create.length, 5);                                  // both are still CRM companies
});

test('a company that matches an EXISTING CRM company also becomes a prospect, linked to it', () => {
  const e = emptyExisting();
  e.companies = [ex({ id: 'c-gamma', name: 'Gamma' })];
  const plan = planImport(parsed(ROWS), e, {}, ids, { prospects: true });
  const gamma = plan.prospects.create.find((p) => p.entityName === 'Gamma LLC');
  assert.equal(gamma.companyId, 'c-gamma');
});

test('the prospect record has the shape the desktop card reads, and says where every value came from', () => {
  const plan = planImport(parsed(ROWS, { 'HR Name': 'contact.name' }), emptyExisting(), {}, ids, { prospects: true });
  const p = plan.prospects.create.find((x) => x.entityName === 'Alpha Pvt. Ltd.');
  const row = buildProspectRow(p.rec, p.contacts, p.companyId, 'leads.xlsx', '2026-11-10T09:00:00.000Z');
  assert.equal(row.target_type, 'company');
  assert.equal(row.entity_name, 'Alpha Pvt. Ltd.');
  assert.equal(row.company_key, 'd:alpha.example');
  assert.equal(row.company_id, p.companyId);
  assert.equal(row.promoted_at, '2026-11-10T09:00:00.000Z');                      // it is in the CRM: the desktop must not promote it a second time
  assert.equal(row.icp_match_score, 0);
  assert.equal(row.identity.url, 'https://www.alpha.example');
  const d = row.research.details;
  assert.deepEqual(d.emails.map((e) => e.email), ['info@alpha.example', 'hr@alpha.example']);
  assert.ok(d.emails.every((e) => e.confidence === 'provided' && /leads\.xlsx/.test(e.how)));
  assert.deepEqual(d.phones.map((x) => [x.number, x.e164, x.kind]), [['+91 98765 43210', '+919876543210', 'phone']]);
  assert.equal(d.locations[0].city, 'Pune');
  assert.equal(d.locations[0].address, 'Plot 1');
  assert.deepEqual(row.decision_makers.map((x) => [x.name, x.title]), [['Ravi Kumar', 'CEO']]);
  const bare = buildProspectRow(plan.prospects.create.find((x) => x.entityName === 'Beta Inc').rec, [], null, 'f', 'T');
  assert.equal(bare.company_key, 'n:beta');
  assert.equal(bare.promoted_at, null);                                            // no CRM company: not "promoted"
  assert.equal(bare.research.details.phones[0].e164, null);                        // no country code: never guessed
  assert.match(bare.research.details.phones[0].note, /no country code/);
});

// ---------------------------------------------------------------- run
function fakeDb({ duplicateNames = new Set(), failProspects = false, noColumn = false } = {}) {
  const log = [], tables = {};
  return {
    log, tables,
    rpc: async (fn, a) => { log.push(fn === 'crm_import_finish' ? ['finish', a.p_counts] : [fn]); return { data: fn === 'crm_import_begin' ? 'batch-1' : null, error: null }; },
    from: (table) => ({
      insert: (rows) => {
        const list = Array.isArray(rows) ? rows : [rows];
        if (table === 'prospect_dossiers' && noColumn) return Promise.resolve({ error: { code: 'PGRST204', message: "Could not find the 'import_batch_id' column of 'prospect_dossiers'" } });
        if (table === 'prospect_dossiers' && failProspects) return Promise.resolve({ error: { code: '42501', message: 'denied' } });
        if (table === 'prospect_dossiers' && list.some((r) => duplicateNames.has(r.entity_name))) return Promise.resolve({ error: { code: '23505', message: 'duplicate key' } });
        (tables[table] ||= []).push(...list);
        log.push(['insert', table, list.length]);
        const p = Promise.resolve({ error: null });
        p.select = () => ({ single: async () => ({ data: { id: `def-${tables[table].length}` }, error: null }) });      // custom field definitions
        return p;
      },
    }),
  };
}

test('prospects are added after companies and contacts, tagged with the batch, linked to their company', async () => {
  const db = fakeDb();
  const e = emptyExisting();
  const plan = planImport(parsed(ROWS, { 'HR Name': 'contact.name' }), e, {}, ids, { prospects: true });
  const res = await runImport(plan, e, { source: 's', fileName: 'leads.xlsx' }, db);
  assert.equal(res.created.prospects, 5);
  const order = db.log.filter((l) => l[0] === 'insert').map((l) => l[1]);
  assert.ok(order.indexOf('companies') < order.indexOf('contacts') && order.indexOf('contacts') < order.indexOf('prospect_dossiers'));
  for (const r of db.tables.prospect_dossiers) assert.equal(r.import_batch_id, 'batch-1');
  const companyIds = new Set(db.tables.companies.map((c) => c.id));
  assert.ok(db.tables.prospect_dossiers.every((r) => companyIds.has(r.company_id)));
  assert.equal(db.log.find((l) => l[0] === 'finish')[1].created.prospects, 5);
});

test('a prospect that somebody added meanwhile (unique key) is skipped quietly, the others still go in, and it is not reported as a failure', async () => {
  const db = fakeDb({ duplicateNames: new Set(['Delta']) });
  const e = emptyExisting();
  const plan = planImport(parsed(ROWS), e, {}, ids, { prospects: true });
  const res = await runImport(plan, e, { source: 's', fileName: 'f', chunkSize: 50 }, db);
  assert.equal(res.created.prospects, 4);
  assert.equal(res.failed.length, 0);
});

test('a refusal to add prospects is a reported problem, but the companies and contacts are kept and the batch is closed', async () => {
  const db = fakeDb({ failProspects: true });
  const e = emptyExisting();
  const plan = planImport(parsed(ROWS), e, {}, ids, { prospects: true });
  const res = await runImport(plan, e, { source: 's', fileName: 'f' }, db);
  assert.equal(res.created.companies, 5);
  assert.equal(res.created.prospects, 0);
  assert.ok(res.failed.length >= 1 && res.failed.every((f) => f.table === 'prospect_dossiers'));
  assert.ok(db.log.some((l) => l[0] === 'finish'));
});

test('if the database update for prospects is not installed, ONE clear problem is reported, not one per row, and everything else is kept', async () => {
  const db = fakeDb({ noColumn: true });
  const e = emptyExisting();
  const plan = planImport(parsed(ROWS), e, {}, ids, { prospects: true });
  const res = await runImport(plan, e, { source: 's', fileName: 'f', chunkSize: 2 }, db);
  assert.equal(res.created.companies, 5);
  assert.equal(res.created.prospects, 0);
  assert.equal(res.failed.length, 1);
  assert.match(res.failed[0].message, /database update.*not installed/);
});

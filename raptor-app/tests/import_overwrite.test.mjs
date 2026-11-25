// Run with:  node --test tests/import_overwrite.test.mjs      (from raptor-app/)
// Step 5: updating records that already exist - "fill empty fields only" (the default) or "overwrite", with a before/after preview.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { parseTables, planImport, sameValue } from '../src/lib/import/plan.ts';
import { runImport } from '../src/lib/import/run.ts';

const OPTS = { dateOrder: 'dmy', extraPlaceholders: new Set(), stageMap: {}, stageKeys: new Set(['lead']), defaultStage: 'lead' };
const ids = () => { let n = 0; return () => `id${++n}`; };

const EXISTING = () => ({
  companies: [
    { id: 'c1', name: 'Acme Co', website_url: 'https://acme.com', phone: '+91 98765 43210', email: null, address: 'Old Street 1', city: 'Pune', industry: null, description: null, custom_fields: { f1: 'Long', f2: '10' }, created_at: '2026-01-01' },
    { id: 'c2', name: 'Beta Ltd', website_url: null, phone: null, email: null, address: null, city: null, industry: null, description: null, custom_fields: {}, created_at: '2026-01-02' },
  ],
  contacts: [{ id: 'p1', name: 'Asha Rao', email: 'asha@acme.com', phone: '111111', company_id: 'c1', first_name: 'Asha', last_name: null, linkedin_url: null, custom_fields: {} }],
  deals: [], dossiers: [],
  defs: { company: new Map([['cycle', 'f1'], ['employees', 'f2']]), contact: new Map(), deal: new Map() },
});

function planFor(rows, choices, kind, existing, overwrite) {
  const table = analyseSheet('S', false, rows);
  const parsed = parseTables([{ table, choices, rowKind: kind }], OPTS);
  return planImport(parsed, existing, {}, ids(), { overwrite });
}

const COMPANY_ROWS = [['Company', 'Website', 'Phone', 'City', 'Address', 'Industry', 'Cycle', 'Employees'],
  ['Acme Co', 'www.acme.com/', '098765 43210', 'Mumbai', '', 'Software', 'Short', '12'],
  ['Beta Ltd', 'beta.io', '', 'Delhi', 'Road 5', '', '', '']];
const COMPANY_CHOICES = [{ field: 'company.name' }, { field: 'company.website_url' }, { field: 'company.phone' }, { field: 'company.city' }, { field: 'company.address' }, { field: 'company.industry' },
  { field: 'custom', customEntity: 'company', customName: 'Cycle' }, { field: 'custom', customEntity: 'company', customName: 'Employees', customType: 'number' }];

test('values that mean the same are the same: phones by digits, websites without protocol/www/slash, text without case and spaces', () => {
  assert.ok(sameValue('phone', '+91 98765 43210', '+91 9876543210'));
  assert.ok(!sameValue('phone', '+91 98765 43210', '+91 98765 43211'));
  assert.ok(sameValue('phone', '+91 98765 43210', '098765 43210'));        // same number, one without the country code
  assert.ok(!sameValue('phone', '12345', '+91 12345'));                   // too short to call the same
  assert.ok(sameValue('website_url', 'https://www.acme.com/', 'acme.com'));
  assert.ok(sameValue('city', 'Pune ', 'pune'));
  assert.ok(!sameValue('city', 'Pune', 'Mumbai'));
});

test('fill mode (the default): only empty fields, each listed as a fill; nothing is replaced', () => {
  const plan = planFor(COMPANY_ROWS, COMPANY_CHOICES, 'company', EXISTING(), false);
  const acme = plan.companies.update.find((u) => u.id === 'c1');
  assert.deepEqual(Object.keys(acme.patch).sort(), ['industry']);                 // city, cycle, employees already hold values; website/phone are the same; address empty in file
  assert.deepEqual(acme.changes.map((c) => [c.label, c.kind, c.before, c.after]), [['Industry', 'fill', null, 'Software']]);
  const beta = plan.companies.update.find((u) => u.id === 'c2');
  assert.deepEqual(Object.keys(beta.patch).sort(), ['address', 'city', 'website_url']);
  assert.ok(beta.changes.every((c) => c.kind === 'fill'));
});

test('overwrite mode: different values replace, same values and empty file cells change nothing, and the preview carries before and after', () => {
  const plan = planFor(COMPANY_ROWS, COMPANY_CHOICES, 'company', EXISTING(), true);
  const acme = plan.companies.update.find((u) => u.id === 'c1');
  const byLabel = Object.fromEntries(acme.changes.map((c) => [c.label, c]));
  assert.deepEqual(Object.keys(byLabel).sort(), ['City / region', 'Cycle', 'Employees', 'Industry']);
  assert.deepEqual([byLabel['City / region'].kind, byLabel['City / region'].before, byLabel['City / region'].after], ['overwrite', 'Pune', 'Mumbai']);
  assert.deepEqual([byLabel.Cycle.before, byLabel.Cycle.after], ['Long', 'Short']);
  assert.deepEqual([byLabel.Employees.before, byLabel.Employees.after], ['10', '12']);
  assert.equal(byLabel.Industry.kind, 'fill');
  assert.equal('website_url' in acme.patch, false);                                // www.acme.com/ is the same site
  assert.equal('phone' in acme.patch, false);                                      // same digits
  assert.equal('address' in acme.patch, false);                                    // the file cell is empty: an existing value is never blanked
  assert.equal(acme.patch['cf:f1'], 'Short');
  assert.equal('name' in acme.patch, false);                                       // records are never renamed
});

test('overwrite mode on people: fields change, the person never moves to another company', () => {
  const rows = [['Name', 'Email', 'Phone', 'Company'], ['Asha Rao', 'asha.rao@acme.com', '222222', 'Acme Co'], ['Asha Rao', 'asha.rao@beta.com', '333333', 'Beta Ltd']];
  const choices = [{ field: 'contact.name' }, { field: 'contact.email' }, { field: 'contact.phone' }, { field: 'company.name' }];
  const overwrite = planFor(rows, choices, 'contact', EXISTING(), true);
  const u = overwrite.contacts.update.find((x) => x.id === 'p1');
  assert.deepEqual(Object.keys(u.patch).sort(), ['email', 'last_name', 'phone']);
  assert.equal(u.patch.phone, '222222');
  assert.equal(u.patch.email, 'asha.rao@acme.com');
  assert.equal('company_id' in u.patch, false);
  assert.equal(overwrite.contacts.create.length, 1);                               // the same name at ANOTHER company is another person, not a move
  const fill = planFor(rows, choices, 'contact', EXISTING(), false);
  const f = fill.contacts.update.find((x) => x.id === 'p1');
  assert.deepEqual(Object.keys(f.patch), ['last_name']);                           // only the empty field
});

test('the runner tells the database which mode to use', async () => {
  const calls = [];
  const db = {
    rpc: async (fn, args) => { calls.push([fn, args]); return { data: fn === 'crm_import_begin' ? 'b1' : { applied: ['x'] }, error: null }; },
    from: () => ({ insert: () => Promise.resolve({ error: null }) }),
  };
  for (const overwrite of [false, true]) {
    calls.length = 0;
    const plan = planFor(COMPANY_ROWS, COMPANY_CHOICES, 'company', EXISTING(), overwrite);
    await runImport(plan, EXISTING(), { source: 's', fileName: 'f', overwrite }, db);
    const applies = calls.filter((c) => c[0] === 'crm_import_apply_update');
    assert.ok(applies.length >= 2);
    assert.ok(applies.every((c) => c[1].p_only_empty === !overwrite));
  }
});

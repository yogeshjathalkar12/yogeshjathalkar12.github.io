// Run with:  node --test tests/import_country_owner.test.mjs      (from raptor-app/)
// Step 4 of the CRM data work: the default country for phone numbers without a code, and who the new people and deals belong to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_BY_CODE, applyCountry } from '../src/lib/import/countries.ts';
import { parsePhones } from '../src/lib/import/values.ts';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { parseTables, planImport } from '../src/lib/import/plan.ts';
import { runImport } from '../src/lib/import/run.ts';

const IN = COUNTRY_BY_CODE.get('IN'), GB = COUNTRY_BY_CODE.get('GB'), US = COUNTRY_BY_CODE.get('US'), AE = COUNTRY_BY_CODE.get('AE');

test('a national number gets the country code; trunk zero is dropped; a code already there is not doubled', () => {
  assert.equal(applyCountry('98765 43210', IN).value, '+91 9876543210');
  assert.equal(applyCountry('020-2567 1234', IN).value, '+91 2025671234');
  assert.equal(applyCountry('919876543210', IN).value, '+91 9876543210');
  assert.equal(applyCountry('+91 98765 43210', IN).value, '+91 98765 43210');          // untouched
  assert.equal(applyCountry('9198765432', IN).value, '+91 9198765432');                // 10 digits starting 91: national
  assert.equal(applyCountry('07911 123456', GB).value, '+44 7911123456');
  assert.equal(applyCountry('(415) 555-1234', US).value, '+1 4155551234');
  assert.equal(applyCountry('1 415 555 1234', US).value, '+1 4155551234');
  assert.equal(applyCountry('050 123 4567', AE).value, '+971 501234567');
});

test('a number that does not fit the country is left as written, with a note', () => {
  const r = applyCountry('12345678', IN);
  assert.equal(r.value, '12345678');
  assert.match(r.note, /8 digits.*India/);
  assert.equal(applyCountry('123456789012', US).value, '123456789012');
});

test('parsePhones without a country changes nothing; with one it adds the code to every piece and says what did not fit', () => {
  assert.deepEqual(parsePhones('98765 43210').primary, '98765 43210');
  const r = parsePhones('98765 43210 / 020-25671234 / 55512', IN);
  assert.equal(r.primary, '+91 9876543210');
  assert.deepEqual(r.others, ['+91 2025671234']);
  assert.equal(r.notes.length, 0);
  assert.equal(r.problems.length, 1);                                                  // 55512: too few digits, as before
  assert.equal(parsePhones('12345678', IN).notes.length, 1);
  assert.equal(parsePhones('+44 20 7946 0958', IN).primary, '+44 20 7946 0958');         // a number with a code is never rewritten
});

const OPTS = (extra = {}) => ({ dateOrder: 'dmy', extraPlaceholders: new Set(), stageMap: {}, stageKeys: new Set(['lead']), defaultStage: 'lead', ...extra });
const emptyExisting = () => ({ companies: [], contacts: [], deals: [], dossiers: [], defs: { company: new Map(), contact: new Map(), deal: new Map() } });
const ROWS = [['Company', 'Name', 'Phone'], ['Acme', 'Asha Rao', '98765 43210'], ['Beta', 'Ben Cole', '+44 20 7946 0958'], ['Gamma', 'Gita Nair', '1234']];
const SETUP = () => {
  const table = analyseSheet('S', false, ROWS);
  return [{ table, rowKind: 'contact', choices: [{ field: 'company.name' }, { field: 'contact.name' }, { field: 'contact.phone' }] }];
};
const idMaker = () => { let n = 0; return () => `id${++n}`; };

test('the planner uses the chosen country only when one is chosen', () => {
  const none = planImport(parseTables(SETUP(), OPTS()), emptyExisting(), {}, idMaker());
  assert.equal(none.contacts.create.find((c) => c.rec.name === 'Asha Rao').rec.phone, '98765 43210');
  const withIn = planImport(parseTables(SETUP(), OPTS({ defaultCountry: 'IN' })), emptyExisting(), {}, idMaker());
  const byName = Object.fromEntries(withIn.contacts.create.map((c) => [c.rec.name, c.rec.phone]));
  assert.equal(byName['Asha Rao'], '+91 9876543210');
  assert.equal(byName['Ben Cole'], '+44 20 7946 0958');
  assert.equal(byName['Gita Nair'], undefined);                                         // 4 digits: too few, left out as before
  const unknown = parseTables(SETUP(), OPTS({ defaultCountry: 'ZZ' }));
  assert.equal([...unknown.contacts.values()].find((c) => c.name === 'Asha Rao').phone, '98765 43210');   // unknown code = nothing added
});

function recordingDb() {
  const inserted = { contacts: [], deals: [], companies: [] };
  return {
    inserted,
    rpc: async (fn) => ({ data: fn === 'crm_import_begin' ? 'b1' : null, error: null }),
    from: (table) => ({
      insert: (rows) => { const list = [].concat(rows); (inserted[table] ||= []).push(...list); const pr = Promise.resolve({ error: null }); pr.select = () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }); return pr; },
    }),
  };
}

test('the chosen owner is written on new contacts and deals, never on companies; no owner = no assignee at all', async () => {
  const table = analyseSheet('S', false, [['Company', 'Name', 'Deal'], ['Acme', 'Asha Rao', 'Pilot']]);
  const setup = [{ table, rowKind: 'deal', choices: [{ field: 'company.name' }, { field: 'contact.name' }, { field: 'deal.title' }] }];
  const plan = () => planImport(parseTables(setup, OPTS()), emptyExisting(), {}, idMaker());
  const withOwner = recordingDb();
  await runImport(plan(), emptyExisting(), { source: 's', fileName: 'f', assigneeId: 'user-7' }, withOwner);
  assert.equal(withOwner.inserted.contacts[0].assignee_id, 'user-7');
  assert.equal(withOwner.inserted.deals[0].assignee_id, 'user-7');
  assert.equal('assignee_id' in withOwner.inserted.companies[0], false);
  const without = recordingDb();
  await runImport(plan(), emptyExisting(), { source: 's', fileName: 'f' }, without);
  assert.equal('assignee_id' in without.inserted.contacts[0], false);
  assert.equal('assignee_id' in without.inserted.deals[0], false);
});

test('the source tag is what the import is filed under', async () => {
  const table = analyseSheet('S', false, [['Company'], ['Acme']]);
  const setup = [{ table, rowKind: 'company', choices: [{ field: 'company.name' }] }];
  const calls = [];
  const db = recordingDb();
  const rpc = db.rpc;
  db.rpc = async (fn, args) => { calls.push([fn, args]); return rpc(fn); };
  await runImport(planImport(parseTables(setup, OPTS()), emptyExisting(), {}, idMaker()), emptyExisting(), { source: 'Pune Expo 2026', fileName: 'list.xlsx' }, db);
  assert.deepEqual(calls.find((c) => c[0] === 'crm_import_begin')[1], { p_source: 'Pune Expo 2026', p_file: 'list.xlsx' });
});

// Run with:  node --test tests/import_shared.test.mjs      (from raptor-app/)
// Step 7: import mappings shared with the whole team (db/migrations/2026-11-25_crm_import_mappings.sql); everything fails soft.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSaved, findSaved } from '../src/lib/import/savedMappings.ts';
import { loadShared, saveShared, forgetShared, mergeMappings } from '../src/lib/import/sharedMappings.ts';

const HEADERS = ['Company', 'Employees', 'City'];
const CHOICES = [{ field: 'company.name' }, { field: 'custom', customEntity: 'company', customName: 'Employees', customType: 'number' }, { field: 'company.city' }];
const mk = (at, emptyWords = '') => buildSaved(HEADERS, CHOICES, 'company', { won: 'closed_won' }, emptyWords, at);

function fakeDb({ rows = [], saveError = null, readError = null, forgetData = 3 } = {}) {
  const calls = [];
  return {
    calls,
    from: (table) => {
      calls.push(['from', table]);
      const q = { select: () => q, order: () => q, limit: () => Promise.resolve({ data: readError ? null : rows, error: readError }) };
      return q;
    },
    rpc: async (fn, args) => { calls.push([fn, args]); return fn === 'crm_import_mapping_forget' ? { data: forgetData, error: null } : { data: null, error: saveError }; },
  };
}

test('what the team has is read back as ordinary saved mappings, marked as shared, with the database\'s own date and use count', async () => {
  const m = mk('2026-11-01T00:00:00Z');
  const db = fakeDb({ rows: [{ signature: m.signature, mapping: m, uses: 4, updated_at: '2026-11-20T10:00:00Z' }, { signature: 'junk', mapping: { nope: true }, uses: 1, updated_at: 'x' }] });
  const got = await loadShared(db);
  assert.equal(got.length, 1);                                         // the unusable row is ignored
  assert.equal(got[0].shared, true);
  assert.equal(got[0].uses, 4);
  assert.equal(got[0].savedAt, '2026-11-20T10:00:00Z');
  assert.equal(findSaved(got, HEADERS).exact, true);                   // and it is found like a local one
  assert.equal(findSaved(got, HEADERS).mapping.columns.employees.customType, 'number');
});

test('when the database part is missing or the read fails, nothing breaks: an empty list', async () => {
  assert.deepEqual(await loadShared(fakeDb({ readError: { code: 'PGRST205', message: 'no such table' } })), []);
  assert.deepEqual(await loadShared({ from: () => { throw new Error('offline'); } }), []);
});

test('saving sends the signature, the column names and the mapping, never the "shared" marker; a refusal is just false', async () => {
  const db = fakeDb();
  const m = { ...mk('2026-11-02T00:00:00Z'), shared: true };
  assert.equal(await saveShared(m, db), true);
  const [fn, args] = db.calls.find((c) => c[0] === 'crm_import_mapping_save');
  assert.equal(args.p_signature, m.signature);
  assert.deepEqual(args.p_headers, HEADERS);
  assert.equal('shared' in args.p_mapping, false);
  assert.equal(args.p_mapping.columns.company.field, 'company.name');
  assert.equal(await saveShared(m, fakeDb({ saveError: { message: 'permission' } })), false);
  assert.equal(await saveShared(m, { rpc: async () => { throw new Error('offline'); } }), false);
});

test('forgetting reports how many went, or null when it was refused or not set up', async () => {
  assert.equal(await forgetShared(fakeDb({ forgetData: 3 })), 3);
  assert.equal(await forgetShared({ rpc: async () => ({ data: null, error: { message: 'Only an owner or admin' } }) }), null);
});

test('the browser\'s list and the team\'s are one list: for the same columns the newer mapping wins, newest first', () => {
  const local = [mk('2026-11-01T00:00:00Z', 'tbc')];
  const team = [{ ...mk('2026-11-10T00:00:00Z', 'n.a.'), shared: true }];
  const merged = mergeMappings(local, team);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].emptyWords, 'n.a.');
  assert.equal(merged[0].shared, true);
  const mergedBack = mergeMappings([mk('2026-11-12T00:00:00Z', 'mine')], team);
  assert.equal(mergedBack[0].emptyWords, 'mine');
  const other = buildSaved(['A', 'B', 'C'], [{ field: 'company.name' }, { field: 'company.city' }, { field: 'company.phone' }], 'company', {}, '', '2026-11-15T00:00:00Z');
  assert.deepEqual(mergeMappings(local, [other]).map((m) => m.signature), [other.signature, local[0].signature]);
});

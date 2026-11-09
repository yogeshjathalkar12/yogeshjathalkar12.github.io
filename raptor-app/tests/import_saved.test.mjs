// Run with:  node --test tests/import_saved.test.mjs      (from raptor-app/)
// Saved mappings: remembered by column NAMES, found again for the same or a nearly-same file, never forcing a wrong field onto an unknown column.
import test from 'node:test';
import assert from 'node:assert/strict';
import { headerKey, signatureOf, buildSaved, findSaved, applySaved, upsert, loadAll, saveAll, forgetAll, STORAGE_KEY } from '../src/lib/import/savedMappings.ts';

const NOW = '2026-11-10T09:00:00.000Z';
const H1 = ['Company Name', 'Region', 'HR Name', 'Email', 'Contact Number', 'Source URL(s)'];
const C1 = [{ field: 'company.name' }, { field: 'company.city' }, { field: 'contact.name' }, { field: 'company.email' }, { field: 'company.phone' }, { field: 'custom', customEntity: 'company', customName: 'Where I found it' }];
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };

test('column names are compared without case, punctuation or order', () => {
  assert.equal(headerKey(' Contact_Number '), headerKey('contact number'));
  assert.equal(signatureOf(['B', 'A', 'a ']), signatureOf(['a', 'b']));
  assert.notEqual(signatureOf(['A', 'B']), signatureOf(['A', 'C']));
});

test('the same columns in another order and spelling find the saved mapping and apply it by NAME', () => {
  const saved = buildSaved(H1, C1, 'company', { won: 'closed' }, 'see site', NOW);
  const found = findSaved([saved], ['source url(s)', 'EMAIL', 'Company Name', 'contact number', 'region', 'HR NAME']);
  assert.equal(found.exact, true);
  const applied = applySaved(found, ['source url(s)', 'EMAIL', 'Company Name', 'contact number', 'region', 'HR NAME']);
  assert.deepEqual(applied.map((c) => c.field), ['custom', 'company.email', 'company.name', 'company.phone', 'company.city', 'contact.name']);
  assert.equal(applied[0].customName, 'Where I found it');
  assert.equal(found.mapping.rowKind, 'company');
  assert.deepEqual(found.mapping.stageMap, { won: 'closed' });
});

test('a nearly-same file (one new column, one missing) starts from the saved mapping; the unknown column is left to the guess', () => {
  const saved = buildSaved(H1, C1, 'company', {}, '', NOW);
  const headers = ['Company Name', 'Region', 'HR Name', 'Email', 'Contact Number', 'Employees'];
  const found = findSaved([saved], headers);
  assert.ok(found && !found.exact);
  const applied = applySaved(found, headers);
  assert.equal(applied[0].field, 'company.name');
  assert.equal(applied[5], null);
});

test('an unrelated file finds nothing, and two columns in common is not enough', () => {
  const saved = buildSaved(H1, C1, 'company', {}, '', NOW);
  assert.equal(findSaved([saved], ['Opportunity', 'Amount', 'Stage', 'Meeting']), null);
  assert.equal(findSaved([saved], ['Company Name', 'Email', 'Opportunity', 'Amount', 'Stage']), null);
  assert.equal(findSaved([], H1), null);
  assert.equal(findSaved([saved], []), null);
});

test('a much bigger saved file does not claim a small one', () => {
  const wide = Array.from({ length: 20 }, (_, i) => `Col ${i}`);
  const saved = buildSaved(wide, wide.map(() => ({ field: 'custom', customEntity: 'company' })), 'company', {}, '', NOW);
  assert.equal(findSaved([saved], wide.slice(0, 4)), null);
});

test('the best of several candidates wins, and the same columns replace instead of piling up', () => {
  const a = buildSaved(H1, C1, 'company', {}, '', '2026-01-01T00:00:00.000Z');
  const b = buildSaved(H1.slice(0, 5), C1.slice(0, 5), 'contact', {}, '', '2026-02-01T00:00:00.000Z');
  assert.equal(findSaved([a, b], H1).mapping.rowKind, 'company');
  let list = upsert([], a);
  list = upsert(list, buildSaved(H1, C1, 'deal', {}, '', NOW));
  assert.equal(list.length, 1);
  assert.equal(list[0].rowKind, 'deal');
  assert.equal(list[0].uses, 2);
  for (let i = 0; i < 60; i++) list = upsert(list, buildSaved([`x${i}`, `y${i}`, `z${i}`], [{ field: 'ignore' }, { field: 'ignore' }, { field: 'ignore' }], 'company', {}, '', NOW));
  assert.ok(list.length <= 40);
});

test('a saved field that no longer exists is not forced onto a column', () => {
  const saved = buildSaved(H1, C1, 'company', {}, '', NOW);
  saved.columns[headerKey('Region')].field = 'company.removed_field';
  const applied = applySaved(findSaved([saved], H1), H1);
  assert.equal(applied[1], null);
});

test('storage: round trip, damaged data is ignored, missing storage is harmless, forgetting works', () => {
  const store = mem();
  const saved = buildSaved(H1, C1, 'company', {}, '', NOW);
  assert.equal(saveAll(store, [saved]), true);
  assert.equal(loadAll(store)[0].signature, saved.signature);
  store.setItem(STORAGE_KEY, '{not json');
  assert.deepEqual(loadAll(store), []);
  store.setItem(STORAGE_KEY, JSON.stringify([{ v: 2 }, null, 5, { v: 1, signature: 's', columns: {} }]));
  assert.equal(loadAll(store).length, 1);
  assert.deepEqual(loadAll(null), []);
  assert.equal(saveAll(null, [saved]), false);
  assert.equal(saveAll({ getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} }, [saved]), false);
  saveAll(store, [saved]);
  forgetAll(store);
  assert.deepEqual(loadAll(store), []);
});

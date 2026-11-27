// Run with:  node --test tests/crm_timeline.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { chunks, mergeActivity, newLine, whereFrom } from '../src/lib/timeline.ts';

const line = (id, at, extra = {}) => ({ id, type: 'note', content: id, created_at: at, ...extra });

test('lines from several places appear once each, newest first', () => {
  const merged = mergeActivity([line('a', '2026-01-01'), line('b', '2026-03-01')], [line('b', '2026-03-01'), line('c', '2026-02-01')], []);
  assert.deepEqual(merged.map((l) => l.id), ['b', 'c', 'a']);
});

test('long lists of ids are asked for in parts', () => {
  assert.deepEqual(chunks([]), []);
  assert.deepEqual(chunks([1, 2, 3], 2), [[1, 2], [3]]);
  assert.equal(chunks([...Array(400).keys()]).length, 3);
});

test('a line says where it came from only when that adds something', () => {
  const names = { contacts: { c1: 'Asha' }, deals: { d1: 'Pilot', d2: 'Renewal' } };
  assert.equal(whereFrom(line('x', '1', { deal_id: 'd1' }), { dealId: 'd1' }, names), '');
  assert.equal(whereFrom(line('x', '1', { deal_id: 'd2' }), { companyId: 'co' }, names), 'Deal: Renewal');
  assert.equal(whereFrom(line('x', '1', { contact_id: 'c1' }), { dealId: 'd1' }, names), 'Asha');
  assert.equal(whereFrom(line('x', '1', { company_id: 'co' }), { companyId: 'co' }, names), '');
});

test('a new line is attached to the deal and its person, or to the company', () => {
  assert.deepEqual(newLine('call', '  spoke ', { dealId: 'd', contactId: 'c' }), { type: 'call', content: 'spoke', deal_id: 'd', contact_id: 'c' });
  assert.deepEqual(newLine('note', 'x', { dealId: 'd', contactId: null }), { type: 'note', content: 'x', deal_id: 'd', contact_id: null });
  assert.deepEqual(newLine('note', 'x', { companyId: 'co' }), { type: 'note', content: 'x', company_id: 'co' });
});

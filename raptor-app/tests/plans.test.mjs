// Run with:  node --test tests/plans.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFeature, isPaid, planKey, usageLines } from '../src/lib/plans.ts';

test('each plan has exactly its features; the earlier plans keep everything; unknown names are free', () => {
  const row = (p) => ['automation', 'desktop_engine', 'ai_sdr', 'brain'].map((f) => hasFeature(p, f));
  assert.deepEqual(row('Free'), [false, false, false, false]);
  assert.deepEqual(row('Reach'), [true, false, false, false]);
  assert.deepEqual(row('Core'), [true, true, false, false]);
  assert.deepEqual(row('SDR'), [true, true, true, false]);
  assert.deepEqual(row('Brain'), [true, true, true, true]);
  for (const old of ['Pro', 'prime', 'Enterprise']) assert.deepEqual(row(old), [true, true, true, true]);
  assert.deepEqual(row('Platinum'), [false, false, false, false]);
  assert.equal(planKey(' sdr '), 'sdr');
  assert.equal(isPaid('Free'), false);
  assert.equal(isPaid(undefined), false);
  assert.equal(isPaid('Reach'), true);
});

test('only limits that apply are listed, with what is used, and a full one is marked', () => {
  const e = { limits: { users: 3, contacts: 5000, researched: null, contacted: 0, credits: 500 }, usage: { users: 3, contacts: 12, researched: 4, contacted: 0 } };
  assert.deepEqual(usageLines(e), [
    { label: 'Users', used: 3, limit: 3, full: true },
    { label: 'Contacts', used: 12, limit: 5000, full: false },
  ]);
  assert.deepEqual(usageLines({ limits: { users: null, contacts: null, researched: null, contacted: null, credits: null } }), []);
});

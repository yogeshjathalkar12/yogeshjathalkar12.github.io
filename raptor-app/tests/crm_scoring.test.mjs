// Run with:  node --test tests/crm_scoring.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRule, ruleMatches, scoreContact } from '../src/lib/scoring.ts';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const asha = { status: 'hot', job_title: 'Sales Director', email: 'asha@acme.test', phone: '', companies: { name: 'Acme' }, tags: ['VIP', 'Expo'], last_interaction_at: '2026-11-17T12:00:00Z', custom_fields: { f1: 'Pune', f2: 0 } };
const r = (field, op, value, points = 5) => ({ id: `${field}${op}${value}`, field, op, value, points });

test('text rules ignore capitals; empty never matches a comparison', () => {
  assert.ok(ruleMatches(asha, r('job_title', 'contains', 'director'), NOW));
  assert.ok(ruleMatches(asha, r('status', 'is', 'HOT'), NOW));
  assert.ok(!ruleMatches(asha, r('status', 'is', 'ho'), NOW));
  assert.ok(ruleMatches(asha, r('company', 'contains', 'acm'), NOW));
  assert.ok(ruleMatches(asha, r('phone', 'empty', ''), NOW));
  assert.ok(!ruleMatches(asha, r('phone', 'contains', '9'), NOW));
  assert.ok(!ruleMatches(asha, r('email', 'contains', '  '), NOW));
});

test('tags, days since contact and own fields', () => {
  assert.ok(ruleMatches(asha, r('tags', 'is', 'vip'), NOW));
  assert.ok(!ruleMatches(asha, r('tags', 'is', 'vi'), NOW));
  assert.ok(ruleMatches(asha, r('days_since_contact', 'over', '7'), NOW));
  assert.ok(ruleMatches(asha, r('days_since_contact', 'under', '30'), NOW));
  assert.ok(ruleMatches({}, r('days_since_contact', 'empty', ''), NOW));
  assert.ok(!ruleMatches({}, r('days_since_contact', 'over', '1'), NOW));
  assert.ok(ruleMatches(asha, r('cf:f1', 'is', 'pune'), NOW));
  assert.ok(ruleMatches(asha, r('cf:f2', 'filled', ''), NOW));              // zero is a value
});

test('the score adds and takes away', () => {
  assert.equal(scoreContact(asha, [r('status', 'is', 'hot', 20), r('job_title', 'contains', 'director', 15), r('phone', 'empty', '', -10), r('tags', 'is', 'none', 99)], NOW), 25);
  assert.equal(scoreContact(asha, [], NOW), 0);
  assert.equal(describeRule(r('job_title', 'contains', 'director', 15), 'Job title'), '+15 when job title contains "director"');
  assert.equal(describeRule(r('phone', 'empty', '', -10), 'Phone'), '-10 when phone is empty');
});

import { defaultPrefs, reconcilePrefs, savedChoice } from '../src/lib/tableView.ts';

test('a column that arrives after the table does still shows for someone who never chose columns', () => {
  const empty = { getItem: () => null, setItem: () => {} };
  const early = [{ id: 'name', label: 'Name', kind: 'text', value: () => '', locked: true }];
  const late = [...early, { id: 'score', label: 'Score', kind: 'number', value: () => 0, defaultVisible: true }];
  assert.equal(savedChoice(empty, 'k'), null);
  assert.deepEqual(reconcilePrefs(savedChoice(empty, 'k'), late).visible, ['name', 'score']);
  const chosen = { getItem: () => JSON.stringify(defaultPrefs(early)), setItem: () => {} };
  assert.deepEqual(reconcilePrefs(savedChoice(chosen, 'k'), late).visible, ['name']);       // a saved choice is kept as chosen
  assert.equal(savedChoice({ getItem: () => 'not json', setItem: () => {} }, 'k'), null);
});

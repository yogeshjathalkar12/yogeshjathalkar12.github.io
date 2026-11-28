// Deals needing attention: node --test tests/deal_warnings.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { dealsNeedingAttention, warningsFor, isOpen, QUIET_DAYS } from '../src/lib/dealWarnings.ts';

const NOW = new Date('2026-11-28T12:00:00Z');
const day = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const STAGES = [{ key: 'lead', type: 'open' }, { key: 'won', type: 'won' }, { key: 'lost', type: 'lost' }];
const deal = (id, extra = {}) => ({ id, title: id, stage: 'lead', created_at: day(2), value: 0, ...extra });
const none = { tasks: [], touches: [], calls: [] };
const kinds = (r) => r.warnings.map((w) => w.kind);

test('a fresh deal has nothing to attend to', () => {
  assert.deepEqual(kinds(warningsFor(deal('a'), none, NOW)), []);
});

test('quiet deals are flagged, more strongly after a month, unless something is planned', () => {
  const old = deal('a', { created_at: day(QUIET_DAYS) });
  assert.deepEqual(kinds(warningsFor(old, none, NOW)), ['quiet']);
  assert.equal(warningsFor(deal('a', { created_at: day(40) }), none, NOW).warnings[0].level, 3);
  assert.deepEqual(kinds(warningsFor(old, { ...none, touches: [{ deal_id: 'a', created_at: day(1) }] }, NOW)), []);
  assert.deepEqual(kinds(warningsFor(old, { ...none, tasks: [{ deal_id: 'a', title: 'call', due_at: day(-3) }] }, NOW)), []);
  assert.deepEqual(kinds(warningsFor({ ...old, meeting_at: day(-1) }, none, NOW)), []);
});

test('overdue tasks and passed close dates are reported in plain words', () => {
  const r = warningsFor(deal('a', { expected_close: '2026-11-20' }), { ...none, tasks: [{ deal_id: 'a', title: 'Send quote', due_at: day(2) }] }, NOW);
  assert.deepEqual(kinds(r), ['close_passed', 'task_overdue']);
  assert.match(r.warnings[1].text, /Send quote/);
  assert.deepEqual(kinds(warningsFor(deal('a', { expected_close: '2026-11-28' }), none, NOW)), []);
  assert.deepEqual(kinds(warningsFor(deal('a'), { ...none, tasks: [{ deal_id: 'a', title: 'x', due_at: day(2), done_at: day(1) }] }, NOW)), []);
});

test('the last call: no next step, unanswered concern and a competitor, with the line', () => {
  const call = {
    id: 'c1', deal_id: 'a', started_at: day(3),
    segments: [{ who: 'You', text: 'Compared with Zoho we are local' }, { who: 'Prospect', text: 'We looked at Zoho and it is too expensive' }],
    metrics: { objections: [{ line: 1, kind: 'price', acknowledged: false }], next_step: { mentioned: false, line: null, at: null } },
  };
  const r = warningsFor(deal('a'), { ...none, calls: [call], rivals: [{ name: 'Zoho' }] }, NOW);
  assert.deepEqual(kinds(r), ['no_next_step', 'concern', 'competitor']);
  assert.equal(r.warnings[1].line, 1);
  assert.equal(r.warnings[2].line, 1); // not our own mention
  assert.match(r.warnings[1].text, /price/);
});

test('only the newest call decides next step and concerns; old calls are ignored', () => {
  const bad = { id: 'old', deal_id: 'a', started_at: day(10), metrics: { objections: [], next_step: { mentioned: false } } };
  const good = { id: 'new', deal_id: 'a', started_at: day(1), metrics: { objections: [], next_step: { mentioned: true } } };
  assert.deepEqual(kinds(warningsFor(deal('a'), { ...none, calls: [bad, good] }, NOW)), []);
  assert.deepEqual(kinds(warningsFor(deal('a', { created_at: day(1) }), { ...none, calls: [{ ...bad, started_at: day(40) }] }, NOW)), []);
});

test('history on the person counts only when they have one open deal', () => {
  const deals = [deal('a', { contact_id: 'p', created_at: day(40) }), deal('b', { contact_id: 'q', created_at: day(40) }), deal('c', { contact_id: 'q', created_at: day(40) })];
  const touches = [{ contact_id: 'p', created_at: day(1) }, { contact_id: 'q', created_at: day(1) }];
  const found = dealsNeedingAttention(deals, STAGES, { ...none, touches }, NOW).map((r) => r.deal.id);
  assert.deepEqual(found.sort(), ['b', 'c']);
});

test('won, lost and deleted deals are left out; custom stage keys follow their type', () => {
  assert.equal(isOpen(deal('a', { stage: 'won' }), STAGES), false);
  assert.equal(isOpen(deal('a', { stage: 'signed' }), [{ key: 'signed', type: 'won' }]), false);
  assert.equal(isOpen(deal('a', { deleted_at: day(1) }), STAGES), false);
  assert.equal(isOpen(deal('a', { stage: 'unknown_stage' }), STAGES), true);
});

test('the most pressing come first, then the larger deal', () => {
  const deals = [deal('small', { created_at: day(40), value: 10 }), deal('big', { created_at: day(40), value: 900 }), deal('mild', { created_at: day(20), value: 5000 })];
  assert.deepEqual(dealsNeedingAttention(deals, STAGES, none, NOW).map((r) => r.deal.id), ['big', 'small', 'mild']);
});

test('five thousand deals are worked through quickly', () => {
  const deals = Array.from({ length: 5000 }, (_, i) => deal(`d${i}`, { contact_id: `p${i}`, created_at: day(i % 60) }));
  const touches = Array.from({ length: 20000 }, (_, i) => ({ contact_id: `p${i % 5000}`, created_at: day(30 + (i % 30)) }));
  const started = Date.now();
  dealsNeedingAttention(deals, STAGES, { ...none, touches }, NOW);
  assert.ok(Date.now() - started < 3000);
});

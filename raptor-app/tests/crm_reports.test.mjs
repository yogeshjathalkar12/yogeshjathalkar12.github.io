// Run with:  node --test tests/crm_reports.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTERS, blankConfig, dayOf, fieldsOf, periodRange, readConfig, runReport } from '../src/lib/reports.ts';

const now = new Date(2026, 10, 27, 12);
const ctx = {
  now,
  stages: [{ key: 'lead', label: 'Lead', type: 'open', sort_order: 0 }, { key: 'meeting', label: 'Meeting', type: 'open', sort_order: 1 }, { key: 'won', label: 'Won', type: 'won', sort_order: 2 }],
  people: { u1: 'asha', u2: 'ben' },
  custom: [{ id: 'f1', entity_type: 'deal', name: 'Region', field_type: 'select' }, { id: 'f2', entity_type: 'deal', name: 'Seats', field_type: 'number' }, { id: 'f3', entity_type: 'contact', name: 'Other', field_type: 'text' }],
  probability: () => 50,
};
const deals = [
  { id: 1, stage: 'meeting', value: 100, assignee_id: 'u1', tags: ['vip', 'web'], created_at: '2026-11-02T10:00:00Z', custom_fields: { f1: 'North', f2: '3' } },
  { id: 2, stage: 'lead', value: '300', assignee_id: 'u2', tags: [], created_at: '2026-09-15T10:00:00Z', custom_fields: {} },
  { id: 3, stage: 'won', value: 500, assignee_id: 'u1', created_at: '2026-06-01T10:00:00Z', closed_at: '2026-09-20T10:00:00Z' },
  { id: 4, stage: 'won', value: null, assignee_id: null, created_at: '2026-11-01T10:00:00Z', closed_at: '2026-11-20T10:00:00Z' },
  { id: 5, stage: 'lead', value: 999, deleted_at: '2026-11-01', created_at: '2026-11-01T10:00:00Z' },
];
const run = (patch) => runReport({ ...blankConfig(), ...patch }, deals, ctx);
const pairs = (r) => r.points.map((p) => [p.label, p.value]);

test('counting by stage keeps the pipeline order and leaves the recycle bin out', () => {
  const r = run({});
  assert.deepEqual(pairs(r), [['Lead', 1], ['Meeting', 1], ['Won', 2]]);
  assert.equal(r.total, 4);
});

test('totals, averages and weighted values', () => {
  assert.deepEqual(pairs(run({ measure: 'sum', value: 'value', group: 'owner' })), [['asha', 600], ['ben', 300], ['(none)', 0]]);
  assert.equal(run({ measure: 'average', value: 'value', group: '' }).total, 300);          // an empty value is not counted as zero
  assert.equal(run({ measure: 'sum', value: 'weighted', group: '' }).total, 450);
  assert.equal(run({ measure: 'sum', value: 'cf:f2', group: '' }).total, 3);
  assert.equal(run({ measure: 'sum', value: 'value', group: '' }).money, true);
});

test('a deal with two tags counts under both', () => {
  assert.deepEqual(pairs(run({ group: 'tags' })), [['(none)', 3], ['vip', 1], ['web', 1]]);
});

test('months are in order, with empty months shown as zero inside a period', () => {
  const r = run({ group: 'closed_at', period: 'this_quarter', periodField: 'closed_at', measure: 'sum', value: 'value' });
  assert.deepEqual(pairs(r), [['Oct 2026', 0], ['Nov 2026', 0], ['Dec 2026', 0]]);
  const year = run({ group: 'closed_at', filters: [{ field: 'status', op: 'is', value: 'Won' }] });
  assert.deepEqual(pairs(year), [['Sep 2026', 1], ['Oct 2026', 0], ['Nov 2026', 1]]);
  assert.deepEqual(pairs(run({ group: 'closed_at' })).at(-1), ['No date', 2]);
});

test('periods', () => {
  assert.deepEqual(periodRange('this_month', now), ['2026-11-01', '2026-11-30']);
  assert.deepEqual(periodRange('last_month', now), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(periodRange('this_quarter', now), ['2026-10-01', '2026-12-31']);
  assert.deepEqual(periodRange('last_12_months', now), ['2025-12-01', '2026-11-30']);
  assert.deepEqual(periodRange('last_90_days', now), ['2026-08-30', '2026-11-27']);
  assert.equal(periodRange('all', now), null);
  assert.equal(dayOf('2026-03-01'), '2026-03-01');
  assert.equal(run({ period: 'this_month' }).count, 2);
});

test('conditions', () => {
  const only = (field, op, value) => run({ group: '', filters: [{ field, op, value }] }).count;
  assert.equal(only('value', 'over', '100'), 2);
  assert.equal(only('value', 'empty', ''), 1);
  assert.equal(only('owner', 'is', 'ASHA'), 2);
  assert.equal(only('owner', 'is_not', 'asha'), 2);
  assert.equal(only('tags', 'contains', 'vi'), 1);
  assert.equal(only('cf:f1', 'is', 'north'), 1);
  assert.equal(only('created_at', 'under', '2026-09-01'), 1);
  assert.equal(only('value', 'over', ''), 4);                                              // still being typed
});

test('many groups are folded into Other without losing records', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: i, industry: `i${String(i).padStart(2, '0')}`, created_at: '2026-11-01' }));
  const r = runReport(blankConfig('companies'), many, ctx);
  assert.equal(r.points.length, 25);
  assert.equal(r.points.at(-1).label, 'Other (16)');
  assert.equal(r.points.reduce((a, p) => a + p.count, 0), 40);
});

test('own fields belong to their kind of record, and an odd saved report is tidied', () => {
  const ids = fieldsOf('deals', ctx).map((f) => f.id);
  assert.ok(ids.includes('cf:f1') && !ids.includes('cf:f3'));
  const tidy = readConfig({ source: 'nonsense', measure: 'sum', value: 'gone', group: 'gone', filters: [{ field: 'gone', op: 'is' }, null], chart: 'radar' }, ctx);
  assert.deepEqual([tidy.source, tidy.measure, tidy.value, tidy.group, tidy.filters.length, tidy.chart], ['deals', 'sum', 'value', 'stage', 0, 'bar']);
  assert.equal(readConfig({ source: 'tasks', measure: 'sum' }).measure, 'count');
  for (const s of STARTERS) assert.deepEqual(readConfig(s.config, ctx), s.config);
});

test('tasks and activity', () => {
  const tasks = [{ done_at: '2026-11-01' }, { done_at: null, due_at: '2026-11-01T00:00:00Z' }, { done_at: null, due_at: '2026-12-01T00:00:00Z' }];
  assert.deepEqual(pairs(runReport(blankConfig('tasks'), tasks, ctx)), [['To do', 1], ['Overdue', 1], ['Done', 1]]);
  const acts = [{ type: 'call', created_by: 'u1' }, { type: 'call', created_by: 'u2' }, { type: 'note', created_by: 'u1' }];
  assert.deepEqual(pairs(runReport(blankConfig('activities'), acts, ctx)), [['Call', 2], ['Note', 1]]);
});

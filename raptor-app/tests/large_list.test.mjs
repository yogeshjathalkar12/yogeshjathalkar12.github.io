// node --test tests/large_list.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, canSort, customServerField, filterOps, likePattern, period, planOps, quoted } from '../src/lib/largeList.ts';

const text = { type: 'text', column: 'email' };
const num = { type: 'number', column: 'lead_score' };
const date = { type: 'date', column: 'created_at' };
const NOTHING = ['eq', 'id', '00000000-0000-0000-0000-000000000000'];

test('what a person types is searched as written', () => {
  assert.equal(likePattern('50%_off\\now'), '%50\\%\\_off\\\\now%');
  assert.equal(quoted('Rao, "Asha" (HQ)'), '"Rao, \\"Asha\\" (HQ)"');
  assert.deepEqual(filterOps(text, '  acme '), [['ilike', 'email', '%acme%']]);
  assert.deepEqual(filterOps(text, ''), []);
});

test('empty and filled', () => {
  assert.deepEqual(filterOps(text, 'empty'), [['or', 'email.is.null,email.eq.""']]);
  assert.deepEqual(filterOps(text, 'Filled'), [['not', 'email', 'is', null], ['neq', 'email', '']]);
  assert.deepEqual(filterOps(num, 'blank'), [['is', 'lead_score', null]]);
});

test('numbers: comparisons, ranges, and nonsense matches nothing', () => {
  assert.deepEqual(filterOps(num, '>=1,000'), [['gte', 'lead_score', 1000]]);
  assert.deepEqual(filterOps(num, '20..5'), [['gte', 'lead_score', 5], ['lte', 'lead_score', 20]]);
  assert.deepEqual(filterOps(num, '7'), [['eq', 'lead_score', 7]]);
  assert.deepEqual(filterOps(num, '!=7'), [['or', 'lead_score.is.null,lead_score.neq.7']]);
  assert.deepEqual(filterOps(num, 'lots'), [NOTHING]);
});

test('dates: a day, a month or a year', () => {
  assert.deepEqual(period('2026-12-31'), ['2026-12-31', '2027-01-01']);
  assert.deepEqual(period('2026-02'), ['2026-02-01', '2026-03-01']);
  assert.equal(period('2026-02-30'), null);
  assert.equal(period('2026-13'), null);
  assert.deepEqual(filterOps(date, '2026'), [['gte', 'created_at', '2026-01-01'], ['lt', 'created_at', '2027-01-01']]);
  assert.deepEqual(filterOps(date, '>2026-01-01'), [['gte', 'created_at', '2026-01-02']]);
  assert.deepEqual(filterOps(date, '<=2026-01'), [['lt', 'created_at', '2026-02-01']]);
  assert.deepEqual(filterOps(date, 'soon'), [NOTHING]);
});

test('choices, including the one an empty value is shown as', () => {
  const status = { type: 'choice', column: 'status', emptyAs: 'cold' };
  assert.deepEqual(filterOps(status, 'hot'), [['eq', 'status', 'hot']]);
  assert.deepEqual(filterOps(status, 'cold'), [['or', 'status.is.null,status.eq."cold"']]);
  assert.deepEqual(filterOps(status, '__empty__'), [['is', 'status', null]]);
});

test('a name column uses the ids found for the typed text', () => {
  const company = { type: 'lookup', column: 'company_id' };
  assert.deepEqual(filterOps(company, 'acme', ['a', 'b']), [['in', 'company_id', ['a', 'b']]]);
  assert.deepEqual(filterOps(company, 'nobody', []), [NOTHING]);
  assert.deepEqual(filterOps(company, 'empty'), [['is', 'company_id', null]]);
});

test('the whole request: search, whose, filters, sort', () => {
  const ops = planOps({
    fields: { email: text, company: { type: 'lookup', column: 'company_id' }, score: num },
    prefs: { sort: { id: 'score', dir: 'desc' }, filters: { email: 'a', company: 'acme', unknown: 'x' } },
    lookups: { company: ['c1'] },
    search: { text: 'rao', columns: ['name', 'email'], ids: { column: 'company_id', values: ['c1', 'c2'] } },
    assignee: { filter: 'user:u9', me: 'me' },
    defaultOrder: { column: 'created_at', ascending: false },
  });
  assert.deepEqual(ops, [
    ['or', 'name.ilike."%rao%",email.ilike."%rao%",company_id.in.(c1,c2)'],
    ['eq', 'assignee_id', 'u9'],
    ['ilike', 'email', '%a%'],
    ['in', 'company_id', ['c1']],
    ['order', 'lead_score', { ascending: false, nullsFirst: false }],
  ]);
});

test('a column that cannot be sorted keeps the standard order', () => {
  const fields = { company: { type: 'lookup', column: 'company_id' } };
  const ops = planOps({ fields, prefs: { sort: { id: 'company', dir: 'asc' }, filters: {} }, assignee: { filter: 'all', me: 'me' }, defaultOrder: { column: 'created_at', ascending: false } });
  assert.deepEqual(ops, [['order', 'created_at', { ascending: false, nullsFirst: false }]]);
  assert.equal(canSort(fields.company), false);
  assert.equal(canSort(undefined), false);
  assert.equal(canSort(text), true);
});

test('custom fields are searched inside the stored fields; their numbers are not', () => {
  assert.deepEqual(customServerField({ id: 'ab-1', field_type: 'select' }), { type: 'choice', column: 'custom_fields->>ab-1' });
  assert.equal(customServerField({ id: 'ab-1', field_type: 'number' }), null);
  assert.equal(customServerField({ id: 'x', field_type: 'date' }).type, 'date');
});

test('the requests land on the query in order', () => {
  const seen = [];
  const q = new Proxy({}, { get: (_, method) => (...args) => { seen.push([method, ...args]); return q; } });
  applyOps(q, [['eq', 'a', 1], ['order', 'b', { ascending: true }]]);
  assert.deepEqual(seen, [['eq', 'a', 1], ['order', 'b', { ascending: true }]]);
});

// Run with:  node --test tests/crm_forecast.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecast, dealProbability, forecastValues, monthsFrom, stageProbability } from '../src/lib/forecast.ts';

const STAGES = [
  { key: 'lead', type: 'open', sort_order: 0 }, { key: 'meet', type: 'open', sort_order: 1 }, { key: 'nego', type: 'open', sort_order: 2 },
  { key: 'won', type: 'won', sort_order: 3 }, { key: 'lost', type: 'lost', sort_order: 4 },
];
const TODAY = new Date(2026, 10, 27);                      // 27 November 2026

test('a stage without its own chance is placed evenly between nothing and certain', () => {
  assert.deepEqual(STAGES.map((s) => stageProbability(s, STAGES)), [25, 50, 75, 100, 0]);
  assert.equal(stageProbability({ ...STAGES[0], probability: 10 }, STAGES), 10);
  assert.equal(stageProbability({ ...STAGES[3], probability: 10 }, STAGES), 100);        // won is won
  assert.equal(stageProbability(undefined, STAGES), 0);
});

test("a deal's own chance wins while it is open, and nothing else once it is closed", () => {
  assert.equal(dealProbability({ id: 'a', stage: 'lead' }, STAGES), 25);
  assert.equal(dealProbability({ id: 'a', stage: 'lead', probability: 90 }, STAGES), 90);
  assert.equal(dealProbability({ id: 'a', stage: 'lead', probability: 0 }, STAGES), 0);
  assert.equal(dealProbability({ id: 'a', stage: 'won', probability: 5 }, STAGES), 100);
  assert.equal(dealProbability({ id: 'a', stage: 'lost', probability: 80 }, STAGES), 0);
  assert.equal(dealProbability({ id: 'a', stage: 'gone' }, STAGES), 0);
});

test('months run on across the new year', () => {
  assert.deepEqual(monthsFrom(TODAY, 4), ['2026-11', '2026-12', '2027-01', '2027-02']);
});

test('every open deal lands in exactly one place, and won money in the month it closed', () => {
  const deals = [
    { id: '1', stage: 'lead', value: 1000, expected_close: '2026-11-30' },                       // 250 likely
    { id: '2', stage: 'nego', value: '2000', expected_close: '2026-12-01', probability: 50 },    // 1000 likely
    { id: '3', stage: 'meet', value: 400, expected_close: '2026-10-31' },                       // passed
    { id: '4', stage: 'meet', value: 600 },                                                     // no date
    { id: '5', stage: 'lead', value: 100, expected_close: '2027-09-01' },                       // later
    { id: '6', stage: 'won', value: 5000, closed_at: '2026-11-02T10:00:00Z' },
    { id: '7', stage: 'won', value: 9999, closed_at: '2025-01-02T10:00:00Z' },                  // long ago: not shown
    { id: '8', stage: 'lost', value: 9999, expected_close: '2026-11-01' },
  ];
  const f = buildForecast(deals, STAGES, TODAY);
  assert.deepEqual([f.months[0].deals, f.months[0].total, f.months[0].weighted, f.months[0].won], [1, 1000, 250, 5000]);
  assert.deepEqual([f.months[1].deals, f.months[1].weighted], [1, 1000]);
  assert.deepEqual([f.overdue.deals, f.undated.deals, f.later.deals], [1, 1, 1]);
  assert.equal([...f.months, f.overdue, f.later, f.undated].reduce((n, r) => n + r.deals, 0), 5);
  assert.deepEqual(f.overdueDeals.map((d) => d.id), ['3']);
  assert.deepEqual(f.undatedDeals.map((d) => d.id), ['4']);
});

test('what is stored from the two boxes', () => {
  assert.deepEqual(forecastValues('', ''), { expected_close: null, probability: null });
  assert.deepEqual(forecastValues('2026-12-05', '40'), { expected_close: '2026-12-05', probability: 40 });
  assert.equal(forecastValues('', '140').probability, 100);
  assert.equal(forecastValues('', '-3').probability, 0);
  assert.equal(forecastValues('', '0').probability, 0);
  assert.equal(forecastValues('', 'abc').probability, null);
});

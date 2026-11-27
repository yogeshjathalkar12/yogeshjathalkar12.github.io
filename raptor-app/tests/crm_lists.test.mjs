// Run with:  node --test tests/crm_lists.test.mjs      (from raptor-app/)
// Whole lists past the 1,000 rows one request can answer, and the sales velocity figure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_SIZE, selectAll } from '../src/lib/selectAll.ts';
import { averageDaysToClose, salesVelocity } from '../src/lib/salesVelocity.ts';

/** A stand-in for a query on `total` rows that, like the real service, never answers more than `cap` rows at once. */
function table(total, { cap = 1000, failOnPage = -1 } = {}) {
  const asked = [];
  const build = () => {
    const orders = [];
    return {
      order(column) { orders.push(column); return this; },
      range(from, to) {
        asked.push({ from, to, orders: [...orders] });
        if (asked.length - 1 === failOnPage) return Promise.resolve({ data: null, error: { message: 'boom' } });
        const rows = [];
        for (let i = from; i <= Math.min(to, total - 1, from + cap - 1); i += 1) rows.push({ id: i });
        return Promise.resolve({ data: rows, error: null });
      },
    };
  };
  return { build, asked };
}

test('every row comes back, in order and once, however long the list is', async () => {
  for (const total of [0, 1, 999, 1000, 1001, 2500, 5000]) {
    const t = table(total);
    const { data, error } = await selectAll(t.build);
    assert.equal(error, null);
    assert.equal(data.length, total, `${total} rows`);
    assert.deepEqual(data.map((r) => r.id), [...Array(total).keys()]);
    assert.equal(t.asked.length, Math.floor(total / PAGE_SIZE) + 1);
  }
});

test('each page asks for its own range and ends the ordering on a unique column', async () => {
  const t = table(1500);
  await selectAll(() => t.build().order('name'));
  assert.deepEqual(t.asked, [{ from: 0, to: 999, orders: ['name', 'id'] }, { from: 1000, to: 1999, orders: ['name', 'id'] }]);
  const keyed = table(3);
  await selectAll(keyed.build, 'deal_id');
  assert.deepEqual(keyed.asked[0].orders, ['deal_id']);
});

test('an error on any page is reported and no half list is handed over', async () => {
  const { data, error } = await selectAll(table(3000, { failOnPage: 1 }).build);
  assert.equal(data, null);
  assert.equal(error.message, 'boom');
});

test('days to win come from the deals themselves', () => {
  const deal = (from, to) => ({ created_at: from, closed_at: to });
  assert.equal(averageDaysToClose([]), null);
  assert.equal(averageDaysToClose([{ created_at: '2026-01-01T00:00:00Z' }, {}]), null);
  assert.equal(averageDaysToClose([deal('2026-01-01T00:00:00Z', '2026-01-11T00:00:00Z'), deal('2026-02-01T00:00:00Z', '2026-02-21T00:00:00Z')]), 15);
  assert.equal(averageDaysToClose([deal('2026-01-01T09:00:00Z', '2026-01-01T10:00:00Z')]), 1);                 // never under a day
  assert.equal(averageDaysToClose([deal('2026-03-01T00:00:00Z', '2026-01-01T00:00:00Z'), deal('2026-01-01T00:00:00Z', '2026-01-05T00:00:00Z')]), 4);
});

test('velocity is unknown when the days are', () => {
  assert.equal(salesVelocity(10, 50000, 40, null), null);
  assert.equal(salesVelocity(10, 50000, 40, 20), 10000);
  assert.equal(salesVelocity(0, 0, 0, 7), 0);
});

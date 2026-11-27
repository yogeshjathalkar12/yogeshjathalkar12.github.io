// Run with:  node --test tests/crm_paging.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLUMN_STEP, TABLE_PAGE, pageOf } from '../src/lib/paging.ts';

const list = (n) => Array.from({ length: n }, (_, i) => i);

test('pages cover the whole list once', () => {
  const rows = list(5000);
  const seen = [];
  for (let p = 0; p < pageOf(rows, 0).pages; p += 1) seen.push(...pageOf(rows, p).rows);
  assert.deepEqual(seen, rows);
  assert.deepEqual([pageOf(rows, 1).from, pageOf(rows, 1).to, pageOf(rows, 1).pages], [101, 200, 50]);
});

test('a page that no longer exists falls back to the nearest one', () => {
  assert.equal(pageOf(list(150), 9).page, 1);
  assert.equal(pageOf(list(150), -2).page, 0);
  assert.equal(pageOf(list(150), NaN).page, 0);
  assert.deepEqual(pageOf([], 3), { rows: [], page: 0, pages: 1, from: 0, to: 0 });
  assert.equal(pageOf(list(TABLE_PAGE), 0).pages, 1);
  assert.ok(COLUMN_STEP > 0);
});

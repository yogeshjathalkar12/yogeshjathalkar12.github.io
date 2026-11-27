// Run with:  node --test tests/crm_quotes.test.mjs      (from raptor-app/)
// The money cases are the same as in the database test (tests/test_quotes_sql.py of the database files).
import test from 'node:test';
import assert from 'node:assert/strict';
import { blankLine, draftOfQuote, lineProblem, newQuote, quoteLink, quoteProblem, quoteRow, statusText, totalsOf, units } from '../src/lib/quotes.ts';

const line = (quantity, unit_price, discount_percent = 0, tax_percent = 0) => ({ quantity: String(quantity), unit_price: String(unit_price), discount_percent: String(discount_percent), tax_percent: String(tax_percent) });

test('the preview comes out like the database', () => {
  for (const [lines, [subtotal, discount, tax, total]] of [
    [[line(3, 19.99)], [59.97, 0, 0, 59.97]],
    [[line(1.5, 33.33, 10, 18)], [50, 5, 8.1, 53.1]],
    [[line(7, 0.07, 50, 5), line(7, 0.07, 50, 5), line(7, 0.07, 50, 5)], [1.47, 0.72, 0.03, 0.78]],
    [[line('1.005', '1.0')], [1.01, 0, 0, 1.01]],
    [[line(2, '1000000.005', '33.33', '12.5')], [2000000.02, 666600.01, 166675, 1500075.01]],
  ]) {
    const t = totalsOf(lines);
    assert.deepEqual([t.subtotal, t.discount, t.tax, t.total], [subtotal, discount, tax, total], JSON.stringify(lines));
  }
});

test('typed numbers are read exactly and nonsense is not a number', () => {
  assert.equal(units('2.5', 2), 250n);
  assert.equal(units('.5', 2), 50n);
  assert.equal(units('7', 3), 7000n);
  assert.equal(units('0.125', 2), 13n);
  for (const bad of ['', 'abc', '-1', '1,5', '1e3', '.']) assert.equal(units(bad, 2), null, bad);
  assert.equal(totalsOf([line('x', 5)]).total, 0);
});

test('what is wrong is said in words', () => {
  assert.match(lineProblem(blankLine()), /name/);
  const ok = { ...blankLine(), name: 'Seat' };
  assert.equal(lineProblem(ok), null);
  for (const [change, word] of [[{ quantity: '' }, /quantity/], [{ unit_price: '-2' }, /price/], [{ discount_percent: '101' }, /discount/], [{ tax_percent: 'GST' }, /tax/]]) assert.match(lineProblem({ ...ok, ...change }), word);
  const d = { ...newQuote('INR', new Date(2026, 10, 27)), lines: [ok] };
  assert.equal(quoteProblem(d), null);
  assert.deepEqual([d.issue_date, d.valid_until], ['2026-11-27', '2026-12-27']);
  assert.match(quoteProblem({ ...d, lines: [] }), /line/);
  assert.match(quoteProblem({ ...d, valid_until: '2026-11-01' }), /before/);
  assert.equal(newQuote('XXX').currency, 'INR');
});

test('a saved quote opens and saves back the same', () => {
  const d = { ...newQuote('USD'), title: ' T ', lines: [{ ...blankLine(), name: 'A', quantity: '2', unit_price: '10' }] };
  const row = quoteRow(d);
  assert.deepEqual([row.title, row.deal_id, row.currency], ['T', null, 'USD']);
  const again = quoteRow(draftOfQuote({ ...row, id: 'q', number: 'Q-1', status: 'draft', token: 't' }));
  assert.deepEqual(again, row);
  assert.ok(quoteLink('a b').endsWith('quote.html?q=a%20b'));
});

test('how a quote stands', () => {
  const now = new Date(2026, 10, 27);
  assert.equal(statusText({ status: 'sent', valid_until: '2026-12-01', viewed_at: null }, now), 'Sent, not seen yet');
  assert.equal(statusText({ status: 'sent', valid_until: '2026-12-01', viewed_at: 'x' }, now), 'Seen, no answer yet');
  assert.equal(statusText({ status: 'sent', valid_until: '2026-11-26', viewed_at: 'x' }, now), 'Out of date');
  assert.equal(statusText({ status: 'accepted', valid_until: '2026-11-26', viewed_at: 'x' }, now), 'Accepted');
});

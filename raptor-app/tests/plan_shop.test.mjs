// node --test tests/plan_shop.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { planChoices } from '../src/lib/planShop.ts';

test('offers are worded plainly, with tax shown only when charged', () => {
  const plans = [{ plan: 'Core', months: 1, price: 25000, total: 25000 }, { plan: 'Core', months: 12, price: 250000, total: 295000 }];
  const [month] = planChoices({ open: true, tax_percent: 0, plans });
  assert.deepEqual([month.label, month.priceText], ['Raptor Core, 1 month', '₹25,000']);
  const [, year] = planChoices({ open: true, tax_percent: 18, plans });
  assert.equal(year.label, 'Raptor Core, 1 year');
  assert.equal(year.priceText, '₹2,95,000 (₹2,50,000 plus 18% tax)');
});

// Run with:  node --test tests/crm_fx.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseCurrency, converted, dealMoneyRow, moneyOf, moneyProblem, ownMoney } from '../src/lib/fx.ts';

test('choosing a currency fills in the saved rate', () => {
  const rates = [{ code: 'USD', rate: '83.50000000' }];
  assert.deepEqual(chooseCurrency(ownMoney, 'USD', rates), { currency: 'USD', amount: '', rate: '83.5' });
  assert.deepEqual(chooseCurrency({ currency: 'USD', amount: '10', rate: '1' }, 'EUR', rates), { currency: 'EUR', amount: '10', rate: '' });
  assert.deepEqual(chooseCurrency({ currency: 'USD', amount: '10', rate: '1' }, '', rates), ownMoney);
});

test('the value follows from amount and rate, and an own-currency deal carries nothing foreign', () => {
  const usd = { currency: 'USD', amount: '10', rate: '90.123' };
  assert.equal(converted(usd), 901.23);
  assert.deepEqual(dealMoneyRow(usd, '5'), { value: 901.23, currency: 'USD', amount: 10, fx_rate: 90.123 });
  assert.deepEqual(dealMoneyRow(ownMoney, '5'), { value: 5, currency: null, amount: null, fx_rate: null });
  assert.equal(converted({ currency: 'USD', amount: '', rate: '2' }), null);
});

test('what is missing is said', () => {
  assert.equal(moneyProblem(ownMoney), null);
  assert.match(moneyProblem({ currency: 'USD', amount: '', rate: '2' }), /amount in USD/);
  assert.match(moneyProblem({ currency: 'USD', amount: '1', rate: '0' }), /1 USD is worth/);
  assert.match(moneyProblem({ currency: 'USD', amount: '-1', rate: '2' }), /amount/);
  assert.deepEqual(moneyOf({ currency: 'USD', amount: 100, fx_rate: '83.50000000' }), { currency: 'USD', amount: '100', rate: '83.5' });
  assert.deepEqual(moneyOf({ value: 5 }), ownMoney);
});

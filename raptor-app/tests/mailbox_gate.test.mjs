// node --test tests/mailbox_gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addressesOf, canAddMailbox, mailboxBlocked } from '../src/lib/mailboxGate.ts';

const box = (id, from_email, day, extra = {}) => ({ id, from_email, created_at: `2026-01-0${day}T00:00:00Z`, ...extra });
const one = [box('1', 'Me@a.test', 1)];
const two = [box('2', 'two@a.test', 2), box('1', 'Me@a.test', 1), box('3', 'me@a.test ', 3)];
const active = { status: 'active', max_mailboxes: 3, org_daily_cap: 40 };

test('the same address saved twice is one mailbox, the earliest first', () => {
  assert.deepEqual(addressesOf(two), ['me@a.test', 'two@a.test']);
});

test('the first mailbox never needs approval, and a database without the rule changes nothing', () => {
  assert.equal(canAddMailbox([], { status: 'none' }).canAdd, true);
  assert.equal(canAddMailbox(two, null).canAdd, true);
  assert.equal(mailboxBlocked(two[0], two, null), false);
});

test('a second one needs an active approval, and stays within its number', () => {
  for (const status of ['none', 'pending', 'approved', 'revoked', 'expired']) {
    assert.equal(canAddMailbox(one, { status, max_mailboxes: 5 }).canAdd, false, status);
  }
  assert.match(canAddMailbox(one, active).note, /covers 3 mailboxes \(1 connected\), 40 emails a day/);
  const full = canAddMailbox(two, { ...active, max_mailboxes: 2 });
  assert.equal(full.canAdd, false);
  assert.match(full.note, /All 2 mailboxes/);
});

test('without approval only the extra, newer mailboxes are held back', () => {
  const none = { status: 'revoked' };
  assert.equal(mailboxBlocked(two[1], two, none), false);
  assert.equal(mailboxBlocked(two[2], two, none), false);       // the same address as the first
  assert.equal(mailboxBlocked(two[0], two, none), true);
  assert.equal(mailboxBlocked({ ...two[0], pool_exempt: true }, two, none), false);
  assert.equal(mailboxBlocked(two[0], two, active), false);
});

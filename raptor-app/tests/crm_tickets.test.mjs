// Run with:  node --test tests/crm_tickets.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueLabel, fromLocalInput, inView, isOverdueTicket, toLocalInput } from '../src/lib/tickets.ts';

const now = Date.parse('2026-11-27T12:00:00Z');
const t = (due, status = 'open', assignee = null) => ({ due_at: due, status, assignee_id: assignee });

test('how long is left, or how late', () => {
  assert.equal(dueLabel(t('2026-11-27T12:30:00Z'), now), 'Due in 30 minutes');
  assert.equal(dueLabel(t('2026-11-27T17:00:00Z'), now), 'Due in 5 hours');
  assert.equal(dueLabel(t('2026-11-24T12:00:00Z'), now), 'Overdue by 3 days');
  assert.equal(dueLabel(t('2026-11-27T11:59:50Z'), now), 'Overdue by 1 minute');
  assert.equal(dueLabel(t('2026-11-24T12:00:00Z', 'resolved'), now), '—');
  assert.equal(dueLabel(t(null), now), '—');
});

test('views', () => {
  assert.equal(isOverdueTicket(t('2026-11-26T00:00:00Z'), now), true);
  assert.equal(isOverdueTicket(t('2026-11-26T00:00:00Z', 'closed'), now), false);
  assert.equal(inView(t(null, 'open', 'u1'), 'mine', 'u1', now), true);
  assert.equal(inView(t(null), 'mine', undefined, now), false);
  assert.equal(inView(t(null), 'overdue', 'u1', now), false);
});

test('the date box keeps the moment', () => {
  const iso = '2026-12-01T09:05:00.000Z';
  assert.equal(fromLocalInput(toLocalInput(iso)), iso);
  assert.equal(toLocalInput(null), '');
  assert.equal(fromLocalInput('soon'), null);
});

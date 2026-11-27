// Run with:  node --test tests/crm_booking.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingLink, bookingProblem, bookingRow, draftOfPage, newDraft, splitBookings, summaryOf } from '../src/lib/booking.ts';

test('a new page can be saved as it is, and what is wrong is said in words', () => {
  const d = newDraft('u1', 'Asia/Kolkata');
  assert.equal(bookingProblem(d), null);
  for (const [change, word] of [
    [{ name: ' ' }, /name/], [{ minutes: '5' }, /10 to 240/], [{ minutes: '' }, /10 to 240/], [{ buffer_minutes: '-1' }, /break/],
    [{ days: [] }, /day/], [{ end_time: '10:15' }, /shorter/], [{ end_time: '09:00' }, /shorter/], [{ days_ahead: '0' }, /ahead/],
    [{ notice_hours: '1.5' }, /notice/], [{ timezone: '' }, /time zone/],
  ]) assert.match(bookingProblem({ ...d, ...change }), word);
});

test('a saved page opens and saves back the same', () => {
  const row = bookingRow({ ...newDraft('u1', 'UTC'), days: [5, 1], name: ' Demo ' });
  assert.deepEqual(row.days, [1, 5]);
  assert.equal(row.name, 'Demo');
  assert.equal(row.minutes, 30);
  const page = { ...row, id: 'p', token: 'abc', start_time: '10:00:00', end_time: '17:00:00' };
  assert.deepEqual(bookingRow(draftOfPage(page)), row);
  assert.equal(summaryOf(page), 'Mon, Fri · 10:00–17:00 (UTC) · 30 minutes');
  assert.ok(bookingLink('a b').endsWith('book.html?p=a%20b'));
});

test('coming up is booked and not over yet, soonest first', () => {
  const now = new Date('2026-11-27T12:00:00Z');
  const b = (id, start, status = 'booked') => ({ id, status, starts_at: `2026-11-${start}:00Z`, ends_at: `2026-11-${start}:00Z` });
  const { upcoming, past } = splitBookings([b('later', '30T10:00'), b('soon', '28T10:00'), b('gone', '20T10:00'), b('off', '29T10:00', 'cancelled')], now);
  assert.deepEqual(upcoming.map((x) => x.id), ['soon', 'later']);
  assert.deepEqual(past.map((x) => x.id), ['off', 'gone']);
});

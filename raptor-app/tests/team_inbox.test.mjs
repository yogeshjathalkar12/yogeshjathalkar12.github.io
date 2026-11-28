// The team inbox: node --test tests/team_inbox.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { inboxList, mailDraft, replySubject } from '../src/lib/teamInbox.ts';

const r = (id, extra = {}) => ({ id, status: 'open', assignee_id: null, intent: 'other', received_at: '2026-11-20T00:00:00Z', handled_at: null, ...extra });

test('views and the order: meetings and interest first, then newest', () => {
  const list = [r('a', { intent: 'not_interested' }), r('b', { intent: 'interested', received_at: '2026-11-19T00:00:00Z' }), r('c', { intent: 'meeting_request', assignee_id: 'me' }),
    r('d', { intent: 'interested', received_at: '2026-11-21T00:00:00Z' }), r('e', { status: 'done', handled_at: '2026-11-22T00:00:00Z' }), r('f', { status: 'done', handled_at: '2026-11-23T00:00:00Z' })];
  assert.deepEqual(inboxList(list, 'open', 'me').map((x) => x.id), ['c', 'd', 'b', 'a']);
  assert.deepEqual(inboxList(list, 'mine', 'me').map((x) => x.id), ['c']);
  assert.deepEqual(inboxList(list, 'unassigned', 'me').map((x) => x.id), ['d', 'b', 'a']);
  assert.deepEqual(inboxList(list, 'done', 'me').map((x) => x.id), ['f', 'e']);
});

test('the draft cannot add recipients or break the link', () => {
  const link = mailDraft({ from_email: 'a@b.test?bcc=evil@x.test&cc=y@z.test', subject: 'Hi & bye', draft: 'Line 1\nLine 2 & more' });
  assert.equal(link.split('?').length, 2);
  assert.ok(!link.split('?')[0].includes('&'));
  assert.ok(decodeURIComponent(link).includes('Re: Hi & bye'));
  assert.ok(link.includes('body=Line%201%0ALine%202%20%26%20more'));
  assert.ok(!mailDraft({ from_email: 'a@b.test', subject: 'x', draft: 'y'.repeat(2000) }).includes('body='));
  assert.equal(replySubject('RE: price'), 'RE: price');
  assert.equal(replySubject(''), 'Re: your email');
});

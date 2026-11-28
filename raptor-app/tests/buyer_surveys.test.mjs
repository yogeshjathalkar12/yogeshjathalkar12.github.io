// Buyer surveys: node --test tests/buyer_surveys.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarise, surveyState, surveyDraft, surveyLink } from '../src/lib/buyerSurveys.ts';

const s = (extra = {}) => ({ id: 'x', deal_id: 'd', token: 't', created_at: '2026-11-01T00:00:00Z', expires_at: '2026-12-31T00:00:00Z', opened_at: null, answered_at: null, reason: null, chose: null, better: null, rating: null, ...extra });

test('states', () => {
  const now = new Date('2026-11-28T00:00:00Z');
  assert.equal(surveyState(s(), now), 'waiting');
  assert.equal(surveyState(s({ opened_at: 'x' }), now), 'opened');
  assert.equal(surveyState(s({ expires_at: '2026-11-01T00:00:00Z' }), now), 'expired');
  assert.equal(surveyState(s({ expires_at: '2026-11-01T00:00:00Z', answered_at: 'x' }), now), 'answered');
});

test('summary counts answers only, joins names whatever the capitals, and averages ratings', () => {
  const sum = summarise([
    s(), s({ answered_at: '2026-11-02', reason: 'price', chose: 'Zoho', rating: 4, better: 'cheaper' }),
    s({ answered_at: '2026-11-03', reason: 'price', chose: ' zoho ', rating: 5 }), s({ answered_at: '2026-11-04', reason: 'timing', better: '  ' }),
  ]);
  assert.equal(sum.sent, 4);
  assert.equal(sum.answered, 3);
  assert.deepEqual(sum.reasons.map((r) => [r.label, r.count]), [['Price', 2], ['Timing', 1]]);
  assert.deepEqual(sum.others, [{ name: 'Zoho', count: 2 }]);
  assert.equal(sum.rating, 4.5);
  assert.equal(sum.ratings, 2);
  assert.equal(sum.comments.length, 1);
  assert.equal(summarise([]).rating, null);
});

test('the email draft keeps the link whole and cannot add recipients', () => {
  const link = surveyDraft('abc', 'a@b.test?bcc=evil@x.test', 'Asha Rao');
  assert.ok(link.startsWith('mailto:'));
  assert.ok(!link.split('?')[0].includes('?'));
  assert.equal(link.split('?').length, 2);
  assert.ok(decodeURIComponent(link).includes(surveyLink('abc')));
  assert.ok(decodeURIComponent(link).includes('Hello Asha,'));
});

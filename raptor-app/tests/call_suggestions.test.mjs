// Suggested CRM changes after a call: node --test tests/call_suggestions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestionsFor } from '../src/lib/callSuggestions.ts';

const STAGES = [
  { key: 'lead', label: 'New Lead', type: 'open', sort_order: 0 }, { key: 'meeting', label: 'Meeting', type: 'open', sort_order: 1 },
  { key: 'won', label: 'Won', type: 'won', sort_order: 2 }, { key: 'lost', label: 'Lost', type: 'lost', sort_order: 3 },
];
const point = (text, line = 0, by = '') => ({ text, quote: `said ${text}`, line, by });
const call = {
  id: 'c', company_name: 'Acme', started_at: '2026-11-20T10:00:00Z',
  segments: [{ who: 'You', text: 'We are better than Zoho' }, { who: 'Prospect', text: 'We are talking to Freshsales and it is expensive' }],
  writeup: { agreed_step: point('Demo on Monday', 0, 'us'), promises: [point('Demo on Monday', 0, 'us'), point('Send the price list', 1, 'us'), point('Check budget', 1, 'them')], open_questions: [point('Does it work offline?', 1)] },
  metrics: { objections: [{ line: 1, kind: 'price', acknowledged: false }, { line: 1, kind: 'price', acknowledged: false }, { line: 0, kind: 'timing', acknowledged: true }], next_step: { mentioned: true, line: 0 } },
};
const keys = (list) => list.map((s) => s.key);

test('tasks come from the agreed step, our promises, open questions and unanswered concerns, once each', () => {
  const s = suggestionsFor(call);
  assert.deepEqual(keys(s), ['step', 'promise:0', 'question:0', 'concern:price']);
  assert.equal(s[0].title, 'Acme: Demo on Monday');
  assert.match(s[0].notes, /said Demo on Monday/);
  assert.match(s[1].title, /price list/);
});

test('a task that already exists is not suggested again', () => {
  const s = suggestionsFor(call, { tasks: [{ title: 'acme:  demo on monday' }] });
  assert.ok(!keys(s).includes('step'));
});

test('the next stage is offered only from the first stage, never to won or lost', () => {
  const first = suggestionsFor(call, { deal: { id: 'd', stage: 'lead' }, stages: STAGES }).find((x) => x.kind === 'stage');
  assert.equal(first.stage, 'meeting');
  assert.equal(suggestionsFor(call, { deal: { id: 'd', stage: 'meeting' }, stages: STAGES }).find((x) => x.kind === 'stage'), undefined);
  const short = [STAGES[0], STAGES[2]];
  assert.equal(suggestionsFor(call, { deal: { id: 'd', stage: 'lead' }, stages: short }).find((x) => x.kind === 'stage'), undefined);
});

test('no next step, no stage move', () => {
  const quiet = { ...call, writeup: null, metrics: { objections: [], next_step: { mentioned: false } } };
  assert.deepEqual(suggestionsFor(quiet, { deal: { id: 'd', stage: 'lead' }, stages: STAGES }), []);
});

test('only competitors the other side named, and not ones already on the deal', () => {
  const rivals = [{ name: 'Zoho' }, { name: 'Freshsales', aliases: ['Freshworks'] }];
  const s = suggestionsFor(call, { deal: { id: 'd', stage: 'meeting', competitors: ['Kylas'] }, stages: STAGES, rivals }).find((x) => x.kind === 'competitors');
  assert.deepEqual(s.competitors, ['Kylas', 'Freshsales']);
  assert.equal(s.line, 1);
  assert.equal(suggestionsFor(call, { deal: { id: 'd', stage: 'meeting', competitors: ['freshworks'] }, stages: STAGES, rivals }).find((x) => x.kind === 'competitors'), undefined);
});

test('a call with nothing saved suggests nothing', () => {
  assert.deepEqual(suggestionsFor({ id: 'x', company_name: '', started_at: '2026-11-20T10:00:00Z' }), []);
});

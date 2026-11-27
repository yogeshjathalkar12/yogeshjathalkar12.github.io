// Run with:  node --test tests/calls_words.test.mjs      (from raptor-app/)
// Words, watch words and call measures. The word cases and their expected answers come from the PC app's own code, so the two stay the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tokens, firstOf, countOf } from '../src/lib/calls/words.ts';
import { linesOf, allHits, hitsFor, splitPhrases, checkTracker, STARTERS } from '../src/lib/calls/trackers.ts';
import { measureCards, mmss } from '../src/lib/calls/measuresView.ts';

const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/call_words.json', import.meta.url), 'utf8'));

test('words are split exactly as the PC app splits them', () => {
  for (const c of cases.tokens) assert.deepEqual(tokens(c.text), c.tokens, c.text);
});

test('phrases are found and counted exactly as the PC app does', () => {
  for (const c of cases.find) {
    assert.equal(firstOf(c.text, c.phrases), c.first, c.text);
    assert.equal(countOf(c.text, c.phrases), c.count, c.text);
  }
});

const call = {
  segments: [
    { who: 'You', at: 1, text: 'Our price is fair and the discount is real' },
    { who: 'Prospect', at: 8, text: 'The price is महंगा, ask my boss about the budget' },
    { who: 'You', at: 20, text: 'Understood' },
  ],
};
const tracker = (over) => ({ id: 'a', name: 'Money', phrases: ['price', 'discount', 'budget', 'महंगा'], who: 'any', is_active: true, ...over });

test('watch words are counted by who said them', () => {
  const lines = linesOf(call);
  assert.deepEqual(hitsFor(lines, tracker()), { tracker: tracker(), count: 5, lines: [0, 1] });
  assert.equal(hitsFor(lines, tracker({ who: 'rep' })).count, 2);
  assert.equal(hitsFor(lines, tracker({ who: 'other' })).count, 3);
});

test('old calls with only a transcript are counted too; unknown speakers are not guessed', () => {
  const lines = linesOf({ transcript: 'Speaker 1: what is the price\nSpeaker 2: no budget\n\nplain line' });
  assert.deepEqual(lines.map((l) => l.who), ['Speaker 1', 'Speaker 2', '']);
  assert.equal(hitsFor(lines, tracker()).count, 2);
  assert.equal(hitsFor(lines, tracker({ who: 'rep' })).count, 0);
  assert.deepEqual(linesOf({}), []);
});

test('only active watch words that were heard are listed, most often first', () => {
  const found = allHits(linesOf(call), [tracker({ id: '1', name: 'Boss', phrases: ['boss'] }), tracker({ id: '2' }), tracker({ id: '3', phrases: ['zebra'] }), tracker({ id: '4', is_active: false })]);
  assert.deepEqual(found.map((h) => [h.tracker.id, h.count]), [['2', 5], ['1', 1]]);
});

test('a watch word is checked before it is saved', () => {
  assert.deepEqual(splitPhrases(' price , Price\n  too   dear ;; महंगा। सस्ता |'), ['price', 'too dear', 'महंगा', 'सस्ता']);
  assert.deepEqual(checkTracker({ name: '  Money  talk ', phrases: 'price' }), { name: 'Money talk', phrases: ['price'] });
  for (const bad of [{ name: '', phrases: 'a' }, { name: 'x', phrases: ' , ' }, { name: 'x'.repeat(61), phrases: 'a' }, { name: 'x', phrases: 'y'.repeat(81) },
    { name: 'money', phrases: 'a' }, { name: 'x', phrases: Array.from({ length: 51 }, (_, i) => `w${i}`).join(',') }]) {
    assert.ok('error' in checkTracker(bad, [tracker({ name: 'Money' })]), JSON.stringify(bad).slice(0, 60));
  }
  assert.ok(!('error' in checkTracker({ name: 'Money', phrases: 'a' }, [tracker({ name: 'Money' })], 'a')));
  for (const s of STARTERS) assert.ok(!('error' in checkTracker({ name: s.name, phrases: s.phrases.join(',') })), s.name);
});

const measures = {
  version: 1, reliability: 'measured', lines: 11, duration: 100,
  talk: { rep_seconds: 49, other_seconds: 19, rep_words: 54, other_words: 23, rep_share: 0.721 },
  longest_monologue: { seconds: 30, line: 2, at: 8 }, questions: { count: 3, lines: [0, 5, 9] }, switches_per_minute: 4.2, reply_gap: { seconds: 1, count: 3 },
  weak: { count: 1, lines: [2] }, fillers: 2,
  objections: [{ line: 4, at: 41, kind: 'price', phrase: 'too expensive', acknowledged: true }, { line: 7, at: 70, kind: 'have_solution', phrase: 'already use', acknowledged: false }],
  buying_signals: [], first_price: { line: 3, at: 29, who: 'You' }, next_step: { mentioned: true, line: 10, at: 96 },
};

test('measures are shown with what to watch, and unmeasured ones are left out', () => {
  const cards = measureCards(measures);
  const byKey = Object.fromEntries(cards.map((c) => [c.key, c]));
  assert.equal(byKey.talk.value, '72%');
  assert.equal(byKey.talk.tone, 'watch');
  assert.equal(byKey.objections.hint, '1 of 2 acknowledged first');
  assert.equal(byKey.price.value, '0:29');
  assert.equal(byKey.price.hint, 'we raised it');
  assert.deepEqual(byKey.next.lines, [10]);
  assert.equal(byKey.signals, undefined);
  const unknown = measureCards({ ...measures, reliability: 'unknown', talk: null, longest_monologue: null, questions: null, weak: null, fillers: null, reply_gap: null, switches_per_minute: null });
  assert.deepEqual(unknown.map((c) => c.key), ['objections', 'price', 'next']);
  assert.deepEqual(measureCards(null), []);
  assert.equal(mmss(125.4), '2:05');
});

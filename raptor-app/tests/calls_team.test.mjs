// Run with:  node --test tests/calls_team.test.mjs      (from raptor-app/)
// Team figures about calls, scorecards and library entries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { figures, byPerson, byWeek, weekOf, concernRanking, wonAgainstLost, MIN_GROUP } from '../src/lib/calls/team.ts';
import { autoAnswer, startingAnswers, scoreOf, checkScorecard, clipLines, RULES, MAX_CLIP_LINES } from '../src/lib/calls/scoring.ts';

const metrics = (over = {}) => ({
  version: 1, reliability: 'measured', lines: 5, duration: 100, talk: { rep_share: 0.6 }, longest_monologue: { seconds: 30 }, questions: { count: 4 },
  next_step: { mentioned: true }, objections: [{ kind: 'price', acknowledged: true }], weak: { count: 0 }, ...over,
});
const call = (id, over = {}) => ({ id, created_by: 'a', started_at: '2026-11-25T10:00:00Z', duration_seconds: 120, deal_id: null, metrics: metrics(), ...over });

test('averages count only what was measured and say from how many calls', () => {
  const f = figures([call('1'), call('2', { metrics: metrics({ talk: null, questions: null, next_step: { mentioned: false }, objections: [{ kind: 'price', acknowledged: null }] }) }), call('3', { metrics: null })]);
  assert.equal(f.calls, 3);
  assert.equal(f.minutes, 6);
  assert.equal(f.measured, 2);
  assert.deepEqual([f.talkShare, f.talkShareFrom], [0.6, 1]);
  assert.deepEqual([f.questions, f.questionsFrom], [4, 1]);
  assert.deepEqual([f.nextStepRate, f.nextStepFrom], [0.5, 2]);
  assert.deepEqual([f.acknowledged, f.concerns], [1, 2]);
  const empty = figures([]);
  assert.deepEqual([empty.calls, empty.talkShare, empty.nextStepRate, empty.acknowledged], [0, null, null, null]);
});

test('per person and per week, weeks without calls shown', () => {
  const calls = [call('1'), call('2', { created_by: 'b' }), call('3', { created_by: 'b', started_at: '2026-11-10T10:00:00Z' }), call('4', { created_by: null })];
  assert.deepEqual(byPerson(calls).map((r) => [r.person, r.figures.calls]), [['b', 2], ['a', 1], ['', 1]]);
  assert.equal(weekOf('2026-11-25T12:00:00'), '2026-11-23');
  assert.equal(weekOf('2026-11-29T12:00:00'), '2026-11-23');       // a Sunday belongs to the week that began on Monday
  assert.equal(weekOf('nonsense'), '');
  const weeks = byWeek(calls, 3, new Date('2026-11-27T12:00:00'));
  assert.deepEqual(weeks.map((w) => [w.week, w.figures.calls]), [['2026-11-09', 1], ['2026-11-16', 0], ['2026-11-23', 3]]);
});

test('concerns are ranked with how often they were acknowledged', () => {
  const ranked = concernRanking([
    call('1', { metrics: metrics({ objections: [{ kind: 'timing', acknowledged: false }, { kind: 'price', acknowledged: true }, { kind: 'price', acknowledged: false }] }) }),
    call('2', { metrics: metrics({ objections: [{ kind: 'price', acknowledged: null }] }) }),
  ]);
  assert.deepEqual(ranked.map((r) => [r.name, r.count, r.calls, r.acknowledged]), [['Price', 3, 2, 0.5], ['Timing', 1, 1, 0]]);
});

test('won and lost are compared only with enough calls on each side', () => {
  const calls = [];
  for (let i = 0; i < MIN_GROUP; i += 1) calls.push(call(`w${i}`, { deal_id: 'won', metrics: metrics({ talk: { rep_share: 0.4 } }) }));
  for (let i = 0; i < MIN_GROUP - 1; i += 1) calls.push(call(`l${i}`, { deal_id: 'lost', metrics: metrics({ talk: { rep_share: 0.8 } }) }));
  const outcome = (id) => id;
  assert.deepEqual(wonAgainstLost(calls, outcome), { enough: false, wonCalls: 10, lostCalls: 9 });
  calls.push(call('l9', { deal_id: 'lost', metrics: metrics({ talk: { rep_share: 0.8 } }) }), call('x', { deal_id: 'open' }), call('y'));
  const result = wonAgainstLost(calls, outcome);
  assert.equal(result.enough, true);
  assert.ok(Math.abs(result.won.talkShare - 0.4) < 1e-9 && Math.abs(result.lost.talkShare - 0.8) < 1e-9);
});

const card = {
  id: 'c', name: 'Discovery', is_active: true,
  items: [
    { id: 't', label: 'Listened', kind: 'auto', rule: { type: 'talk_share', value: 55 } },
    { id: 'q', label: 'Asked', kind: 'auto', rule: { type: 'questions', value: 3 } },
    { id: 'w', label: 'Mentioned money', kind: 'auto', rule: { type: 'watch_word', tracker: 'money' } },
    { id: 'm', label: 'Was friendly', kind: 'manual' },
  ],
};

test('automatic items are answered from the call, and what cannot be judged never counts against', () => {
  const hits = [{ tracker: { id: 'money' }, count: 2, lines: [] }];
  assert.deepEqual(startingAnswers(card, metrics(), hits), { t: 'no', q: 'yes', w: 'yes', m: 'na' });
  assert.deepEqual(startingAnswers(card, null, []), { t: 'na', q: 'na', w: 'no', m: 'na' });
  for (const type of Object.keys(RULES)) assert.ok(['yes', 'no', 'na'].includes(autoAnswer({ type }, metrics({ talk: null, questions: null, longest_monologue: null, weak: null, next_step: null, objections: [] }))));
  assert.equal(autoAnswer({ type: 'acknowledged' }, metrics()), 'yes');
  assert.equal(autoAnswer({ type: 'acknowledged' }, metrics({ objections: [] })), 'na');
  assert.equal(autoAnswer({ type: 'monologue', value: 10 }, metrics()), 'no');
  assert.equal(scoreOf(card, { t: 'no', q: 'yes', w: 'yes', m: 'na' }), 67);
  assert.equal(scoreOf(card, {}), null);
});

test('a scorecard is checked before it is saved', () => {
  assert.ok(!('error' in checkScorecard(card)));
  assert.deepEqual(checkScorecard({ name: ' A ', items: [{ id: '1', label: ' x ', kind: 'manual' }, { id: '2', label: '  ', kind: 'manual' }] }), { name: 'A', items: [{ id: '1', label: 'x', kind: 'manual' }] });
  for (const items of [[], [{ id: '1', label: 'x', kind: 'auto' }], [{ id: '1', label: 'x', kind: 'auto', rule: { type: 'questions' } }],
    [{ id: '1', label: 'x', kind: 'auto', rule: { type: 'watch_word' } }], [{ id: '1', label: 'x', kind: 'manual' }, { id: '1', label: 'y', kind: 'manual' }]]) {
    assert.ok('error' in checkScorecard({ name: 'A', items }), JSON.stringify(items));
  }
  assert.ok('error' in checkScorecard({ name: 'discovery', items: card.items }, [card]));
  assert.ok(!('error' in checkScorecard({ name: 'discovery', items: card.items }, [card], 'c')));
});

test('a library entry keeps at most sixty lines, whichever end was picked first', () => {
  const lines = Array.from({ length: 100 }, (_, i) => ({ who: 'You', text: `l${i}`, at: i }));
  assert.deepEqual(clipLines(lines, 5, 3).map((l) => l.text), ['l3', 'l4', 'l5']);
  assert.equal(clipLines(lines, 0, 99).length, MAX_CLIP_LINES);
  assert.equal(clipLines(lines, -4, 1).length, 2);
});

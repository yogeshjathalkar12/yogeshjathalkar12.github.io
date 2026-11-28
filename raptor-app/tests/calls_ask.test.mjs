// Asking questions across calls: node --test tests/calls_ask.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestion, answerQuestion, DEFAULT_DAYS, MAX_MATCHES } from '../src/lib/calls/ask.ts';

const NOW = new Date('2026-11-28T12:00:00Z');
const day = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const call = (id, company, daysAgo, lines, metrics) => ({
  id, company_name: company, started_at: day(daysAgo), segments: lines.map(([who, text], i) => ({ who, text, at: i * 5 })), metrics,
});
const m = (extra = {}) => ({ objections: [], buying_signals: [], next_step: { mentioned: false, line: null, at: null }, ...extra });

const CALLS = [
  call('a', 'Acme Pvt Ltd', 3, [['You', 'Our price is on the page.'], ['Prospect', 'That is too expensive for us.'], ['You', 'Shall we meet on Monday?']],
    m({ objections: [{ line: 1, kind: 'price', phrase: 'too expensive', acknowledged: false }], next_step: { mentioned: true, line: 2, at: 10 } })),
  call('b', 'Globex', 20, [['Prospect', 'We already use Zoho for this.'], ['You', 'What about integration with your site?']],
    m({ objections: [{ line: 0, kind: 'have_solution', phrase: 'already use', acknowledged: null }] })),
  call('c', 'Initech', 60, [['Prospect', 'Can you send a quote? Integration matters a lot.']],
    m({ buying_signals: [{ line: 0, phrase: 'send a quote' }] })),
  call('d', 'Umbrella', 200, [['Prospect', 'Too costly.']], m({ objections: [{ line: 0, kind: 'price', phrase: 'too costly' }] })),
  call('e', 'Oldco', 5, [['Prospect', 'Hello integration']], null),
];
const ask = (q, extra = {}) => answerQuestion(parseQuestion(q, { calls: CALLS, ...extra }), CALLS, NOW);
const ids = (a) => [...new Set(a.matches.map((x) => x.call.id))];

test('price concerns come from the measures, with the words that were said', () => {
  const a = ask('Who complained about price this month?');
  assert.deepEqual(ids(a), ['a']);
  assert.equal(a.matches[0].text, 'That is too expensive for us.');
  assert.match(a.understood, /concerns about price, said by the other side, the last 30 days/);
});

test('the period is read, and 90 days is assumed when none is said', () => {
  assert.equal(parseQuestion('price objections').days, DEFAULT_DAYS);
  assert.equal(parseQuestion('price objections in the last 2 weeks').days, 14);
  assert.equal(parseQuestion('price objections ever').days, 0);
  assert.deepEqual(ids(ask('price objections ever')), ['a', 'd']);
});

test('calls with no next step are listed and unmeasured calls are reported, not counted', () => {
  const a = ask('Which calls had no next step?');
  assert.deepEqual(ids(a), ['b', 'c']);
  assert.match(a.note, /1 call was not measured/);
  assert.deepEqual(ids(ask('which calls have a next step this week')), ['a']);
});

test('a named company narrows the search', () => {
  const q = parseQuestion('What did Acme say about price?', { calls: CALLS });
  assert.deepEqual(q.companies, ['Acme Pvt Ltd']);
  assert.deepEqual(ids(answerQuestion(q, CALLS, NOW)), ['a']);
  assert.deepEqual(ids(ask('what did globex say about integration')), ['b']);
});

test('competitors are found by name or other name, and "competitor" means any on the list', () => {
  const rivals = [{ name: 'Zoho', aliases: ['Zoho CRM'] }];
  assert.deepEqual(ids(ask('who mentioned Zoho', { rivals })), ['b']);
  assert.deepEqual(ids(ask('did anyone talk about competitors', { rivals })), ['b']);
  assert.match(ask('any competitors mentioned').note, /no competitors on your list/i);
});

test('own watch words are used by their name', () => {
  const trackers = [{ id: 't', name: 'Quotation', phrases: ['quote'], who: 'any', is_active: true }];
  assert.deepEqual(ids(ask('who asked about quotation', { trackers })), ['c']);
});

test('free words search the lines; quoted words are searched exactly', () => {
  assert.deepEqual(ids(ask('who talked about integration')).sort(), ['b', 'c', 'e']);
  assert.deepEqual(ids(ask('who said "send a quote"')), ['c']);
  assert.equal(ask('who said "no such words"').matches.length, 0);
});

test('"did we say" looks only at our side', () => {
  const a = ask('did we say anything about integration');
  assert.deepEqual(ids(a).sort(), ['b', 'c', 'e']); // c and e have no known rep line, so their sides cannot be told apart
  assert.match(a.note, /could not be told apart/);
  assert.ok(a.matches.filter((x) => x.call.id === 'b').every((x) => x.who === 'You'));
});

test('several words need to be in one line; otherwise any of them, and it says so', () => {
  assert.deepEqual(ids(ask('integration quote')), ['c']);
  const a = ask('integration monday');
  assert.ok(a.matches.length > 0);
  assert.match(a.note, /any of them/);
});

test('buying signals', () => {
  assert.deepEqual(ids(ask('any buying signals in the last 3 months')), ['c']);
});

test('Hindi words for price are understood', () => {
  const q = parseQuestion('किसने कीमत के बारे में बोला');
  assert.equal(q.topic.kind, 'concern');
  assert.deepEqual(q.topic.concerns, ['price']);
});

test('a question with nothing to look for says what to type, and an empty one too', () => {
  assert.match(ask('what did they say').note, /Say what to look for/);
  assert.match(ask('').note, /Type a question/);
});

test('long answers are cut and say so', () => {
  const many = [call('z', 'Big', 1, Array.from({ length: MAX_MATCHES + 5 }, () => ['Prospect', 'budget talk']), m())];
  const a = answerQuestion(parseQuestion('"budget"'), many, NOW);
  assert.equal(a.matches.length, MAX_MATCHES);
  assert.match(a.note, /newest 200 of 205/);
});

test('random questions never throw', () => {
  const words = ['who', 'price', 'zoho', 'no', 'next', 'step', 'last', '3', 'weeks', '"', 'Acme', 'we', 'said', 'महंगा', '?', '', 'competitor', 'boss'];
  for (let n = 0; n < 500; n += 1) {
    const q = Array.from({ length: n % 9 }, (_, i) => words[(n * 7 + i * 13) % words.length]).join(' ');
    const a = ask(q, { rivals: [{ name: 'Zoho' }] });
    assert.ok(Array.isArray(a.matches));
  }
});

// Run with:  node --test tests/competitors.test.mjs      (from raptor-app/)
// Battle cards, and what the team's own records say about a competitor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocks, proposals, draftOf, changesOf, cleanPlaybook, cleanAliases, checkNew, FIELDS } from '../src/lib/competitors/card.ts';
import { namesOf, mentionsIn, mentionSummary, winLoss, priceHistory, feed } from '../src/lib/competitors/insight.ts';

const card = {
  id: '1', name: 'Acme Software Pvt. Ltd', url: 'https://acme.test', what_they_sell: 'Rotas', target_customer: 'Unknown', pricing_model: 'Flat fee', positioning: '',
  strengths: ['Trusted by 300 factories', 'Fast'], weaknesses: ['No offline mode'], how_to_beat_them: null,
  sources: { 'Trusted by 300 factories': { url: 'https://acme.test', quote: 'Trusted by 300 factories' }, Fast: { url: 'javascript:alert(1)', quote: 'x' } },
  confirmed: { pricing_model: { by: 'u1', at: '2026-11-01' } }, proposed: { pricing_model: 'Per seat' }, aliases: ['प्लानर'],
};

test('every statement says where it comes from; empty and unknown parts are left out', () => {
  const found = blocks(card);
  assert.deepEqual(found.map((b) => b.key), ['what_they_sell', 'pricing_model', 'strengths', 'weaknesses']);
  const origin = Object.fromEntries(found.flatMap((b) => b.statements.map((s) => [s.text, s.origin])));
  assert.deepEqual(origin, { Rotas: 'suggestion', 'Flat fee': 'confirmed', 'Trusted by 300 factories': 'source', Fast: 'suggestion', 'No offline mode': 'suggestion' });
  assert.equal(found.find((b) => b.key === 'pricing_model').confirmedBy, 'u1');
  assert.deepEqual(proposals(card), [{ key: 'pricing_model', label: 'How they charge', current: ['Flat fee'], proposed: ['Per seat'] }]);
  assert.deepEqual(proposals({ ...card, proposed: null }), []);
});

test('only real changes are sent when a card is edited', () => {
  const draft = draftOf(card);
  assert.deepEqual(changesOf(card, draft), {});
  assert.deepEqual(changesOf(card, { ...draft, what_they_sell: ' Shift   planning ', weaknesses: 'No offline mode\n\n Slow support ' }),
    { what_they_sell: 'Shift planning', weaknesses: ['No offline mode', 'Slow support'] });
  assert.deepEqual(changesOf(card, { ...draft, strengths: '' }), { strengths: [] });
  assert.equal(FIELDS.length, 7);
});

test('playbook, other names and new competitors are tidied and checked', () => {
  assert.deepEqual(cleanPlaybook([{ when: ' They say cheaper ', say: ' Compare totals ' }, { when: 'x', say: ' ' }]), [{ when: 'They say cheaper', say: 'Compare totals' }]);
  assert.deepEqual(cleanAliases('Acme, acme planner; Acme Planner\nA', 'Acme'), ['acme planner']);
  assert.deepEqual(checkNew(' Zeta ', 'zeta.io', [card]), { name: 'Zeta', url: 'https://zeta.io/' });
  for (const [n, u] of [['', 'a.com'], ['acme software pvt. ltd', 'a.com'], ['Z', ''], ['Z', 'ftp://a.com'], ['Z', 'http://localhost:3000'], ['Z', '192.168.1.1'], ['Z', 'notasite']]) {
    assert.ok('error' in checkNew(n, u, [card]), `${n} ${u}`);
  }
});

const calls = [
  { id: 'a', company_name: 'Alpha', started_at: '2026-11-20', deal_id: 'd1', segments: [{ who: 'Prospect', at: 3, text: 'We already use Acme' }, { who: 'You', at: 9, text: 'how is it' }], metrics: { objections: [{ line: 1, kind: 'have_solution' }] } },
  { id: 'b', company_name: 'Beta', started_at: '2026-11-25', deal_id: 'd2', transcript: 'You: unlike प्लानर we work offline\nProspect: ok\nProspect: acmeville is nice' },
  { id: 'c', company_name: 'Gamma', started_at: '2026-11-01', transcript: 'Prospect: no names here' },
];

test('mentions are found on calls by any of their names, with the concern raised next to it', () => {
  assert.deepEqual(namesOf(card), ['Acme Software Pvt. Ltd', 'Acme', 'प्लानर']);
  assert.deepEqual(namesOf({ name: 'Box Inc' }), ['Box Inc']);
  const found = mentionsIn(calls, namesOf(card));
  assert.deepEqual(found.map((m) => [m.callId, m.line, m.who, m.concern]), [['b', 0, 'You', ''], ['a', 0, 'Prospect', 'have_solution']]);
  const summary = mentionSummary(found, calls, (id) => ({ d1: 'lost', d2: 'won' })[id]);
  assert.deepEqual(summary, { mentions: 2, calls: 2, byUs: 1, byThem: 1, deals: { won: 1, lost: 1, open: 0 }, concerns: [['have_solution', 1]] });
});

test('wins and losses against each competitor', () => {
  const deals = [
    { id: '1', title: 'a', stage: 'won', value: 100, competitors: ['acme', 'Acme'], outcome_reason: 'Support' },
    { id: '2', title: 'b', stage: 'lost', value: 50, competitors: ['Acme', 'Zeta'], outcome_reason: 'Price' },
    { id: '3', title: 'c', stage: 'lost', value: null, competitors: ['ACME'], outcome_reason: 'Price' },
    { id: '4', title: 'd', stage: 'lead', value: 5, competitors: ['Zeta'] },
    { id: '5', title: 'e', stage: 'won', value: 5, competitors: [] },
  ];
  const rows = winLoss(deals, (s) => (s === 'won' || s === 'lost' ? s : 'open'), ['Acme']);
  assert.deepEqual(rows.map((r) => [r.competitor, r.won, r.lost, r.open, r.winRate]), [['Acme', 1, 2, 0, 33], ['Zeta', 0, 1, 1, 0]]);
  assert.deepEqual([rows[0].valueWon, rows[0].valueLost, rows[0].lossReasons, rows[0].winReasons], [100, 50, [['Price', 2]], [['Support', 1]]]);
  assert.equal(winLoss([deals[3]], () => 'open')[0].winRate, null);
});

test('the feed and price history', () => {
  const u = (id, over) => ({ id, competitor_id: 'x', kind: 'news', title: id, summary: '', url: null, significance: 'low', status: 'new', happened_at: `2026-11-0${id}T00:00:00Z`, ...over });
  const updates = [u('1', { kind: 'price', details: { min: 10, max: 20 } }), u('2', { status: 'hidden' }), u('3', { status: 'important', competitor_id: 'y' }), u('4', { kind: 'price', details: {} })];
  assert.deepEqual(feed(updates).map((x) => x.id), ['4', '3', '1']);
  assert.deepEqual(feed(updates, { only: 'important' }).map((x) => x.id), ['3']);
  assert.deepEqual(feed(updates, { only: 'hidden' }).map((x) => x.id), ['2']);
  assert.deepEqual(feed(updates, { competitor: 'x', kind: 'price' }).map((x) => x.id), ['4', '1']);
  assert.deepEqual(priceHistory(updates), [{ date: '2026-11-01', min: 10, max: 20 }]);
});

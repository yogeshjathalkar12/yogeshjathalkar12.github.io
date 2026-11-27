// Run with:  node --test tests/crm_tags.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTag, tagsInUse, withTag, withoutTag } from '../src/lib/tags.ts';

test('tags are tidied, never doubled, and limited', () => {
  assert.equal(cleanTag('  big   deal '), 'big deal');
  assert.equal(cleanTag('x'.repeat(60)).length, 40);
  const start = ['VIP'];
  assert.equal(withTag(start, 'vip'), start);
  assert.equal(withTag(start, '   '), start);
  assert.deepEqual(withTag(start, 'event'), ['VIP', 'event']);
  assert.throws(() => withTag(Array.from({ length: 20 }, (_, i) => `t${i}`), 'one more'), /20 tags/);
  assert.deepEqual(withoutTag(['VIP', 'event'], 'vip'), ['event']);
  assert.deepEqual(tagsInUse([{ tags: ['b', 'A'] }, { tags: ['a', 'c'] }, {}, { tags: null }]), ['A', 'b', 'c']);
});

import { describeAssignment, ruleDraftProblem } from '../src/lib/assignment.ts';

test('assignment rules read as a sentence and are checked before saving', () => {
  assert.equal(describeAssignment({ field: 'email', op: 'ends', value: '.in' }, ['asha', 'ben']), 'Email ends with ".in" → asha, ben in turn');
  assert.equal(describeAssignment({ field: 'any', op: 'contains', value: '' }, ['asha']), 'Any new lead → asha');
  assert.match(ruleDraftProblem('email', ' ', ['u']), /look for/);
  assert.match(ruleDraftProblem('any', '', []), /person/);
  assert.equal(ruleDraftProblem('any', '', ['u']), null);
});

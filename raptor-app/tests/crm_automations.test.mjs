// Run with:  node --test tests/crm_automations.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_ACTIONS, NEW_TRIGGERS, OLD_ACTIONS, OLD_TRIGGERS, TRIGGER_NAMES, ACTION_NAMES,
  actionsFor, describeRule, draftOf, emptyDraft, problemWith, ruleRow, withTrigger,
} from '../src/lib/automationRules.ts';

test('every choice has a name and words', () => {
  for (const t of [...OLD_TRIGGERS, ...NEW_TRIGGERS]) {
    assert.ok(TRIGGER_NAMES[t]);
    assert.notEqual(describeRule({ trigger_type: t, trigger_days: 2, action_type: 'webhook' }).when, t);
  }
  for (const a of [...OLD_ACTIONS, ...NEW_ACTIONS]) {
    assert.ok(ACTION_NAMES[a]);
    assert.notEqual(describeRule({ trigger_type: 'deal_won', action_type: a }).then, a);
  }
});

test('before the database update only the old choices exist and only old columns are saved', () => {
  assert.deepEqual(actionsFor('deal_won', false), OLD_ACTIONS);
  const row = ruleRow({ ...emptyDraft(), message: ' Call ' }, false);
  assert.deepEqual(Object.keys(row).sort(), ['action_message', 'action_type', 'action_webhook_url', 'enabled', 'trigger_days', 'trigger_type']);
  assert.equal(row.action_message, 'Call');
});

test('a rule about overdue tasks can neither make tasks nor tag', () => {
  const choices = actionsFor('task_overdue', true);
  assert.ok(!choices.includes('create_reminder') && !choices.includes('add_tag'));
  const moved = withTrigger({ ...emptyDraft(), action: 'create_reminder' }, 'task_overdue', true);
  assert.equal(moved.action, 'log_note');
  assert.equal(moved.days, '0');
  assert.equal(withTrigger(moved, 'deal_stalled', true).days, '3');
});

test('what is missing is said in words', () => {
  const base = { ...emptyDraft(), message: 'x' };
  assert.equal(problemWith(base), null);
  assert.match(problemWith({ ...base, days: '0' }), /1 or more/);
  assert.equal(problemWith({ ...base, trigger: 'contact_created', days: '0' }), null);
  assert.match(problemWith({ ...base, days: '' }), /Days/);
  assert.match(problemWith({ ...base, trigger: 'deal_in_stage' }), /stage/);
  assert.match(problemWith({ ...base, message: ' ' }), /message/);
  assert.match(problemWith({ ...base, action: 'webhook', webhook: 'ftp://x' }), /https/);
  assert.match(problemWith({ ...base, action: 'assign' }), /person/);
  assert.match(problemWith({ ...base, action: 'set_status', value: 'gone' }), /status/);
  assert.match(problemWith({ ...base, action: 'add_tag', value: '  ' }), /tag/);
  assert.match(problemWith({ ...base, trigger: 'deal_won', minValue: '-1' }), /number/);
});

test('only conditions that fit are saved, and a saved rule opens as it was', () => {
  const draft = { ...emptyDraft(), trigger: 'deal_in_stage', days: '2', stage: 'meeting', action: 'assign', value: 'u2', minValue: '500', status: 'hot', tag: ' big ' };
  const row = ruleRow(draft, true);
  assert.deepEqual(row.conditions, { min_value: 500, tag: 'big' });
  assert.equal(row.trigger_value, 'meeting');
  assert.equal(row.action_message, null);
  const again = ruleRow(draftOf(row), true);
  assert.deepEqual(again, row);
  const words = describeRule(row, { stages: { meeting: 'Meeting' }, people: { u2: 'ben@x.in' } });
  assert.equal(words.when, 'A deal has been in Meeting for 2 days (only if worth at least 500 and tagged “big”)');
  assert.equal(words.then, 'assign it to ben@x.in');
});

test('a rule can start from the lead score', () => {
  const draft = { ...emptyDraft(), trigger: 'contact_score', score: ' 40 ', action: 'notify', message: 'Warm' };
  assert.equal(problemWith(draft), null);
  assert.match(problemWith({ ...draft, score: '4.5' }), /whole number/);
  const row = ruleRow(draft, true);
  assert.deepEqual([row.trigger_value, row.trigger_days], ['40', 0]);
  assert.equal(describeRule(row).when, 'A contact’s score reaches 40');
  assert.deepEqual(ruleRow(draftOf(row), true), row);
  assert.ok(actionsFor('contact_score', true).includes('create_reminder'));
});

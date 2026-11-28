// The weekly results report: node --test tests/weekly_report.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, weekStart, reportText } from '../src/lib/weeklyReport.ts';

const from = new Date(2026, 10, 16);                       // Monday 16 November, local time
const at = (day, hour = 12) => new Date(2026, 10, day, hour).toISOString();
const empty = { events: [], campaigns: [], prospects: [], deals: [], calls: [], tasks: [], wonStages: ['won'], lostStages: ['lost'] };
const value = (report, title, label) => report.sections.find((s) => s.title === title).figures.find((f) => f.label === label);

test('weeks start on Monday', () => {
  assert.equal(weekStart(new Date(2026, 10, 22, 23)).getDate(), 16);      // Sunday belongs to the week begun on Monday
  assert.equal(weekStart(new Date(2026, 10, 16, 0)).getDate(), 16);
  assert.equal(weekStart(new Date(2026, 10, 28), 1).getDate(), 16);
});

test('the week and the week before are counted apart, at the edges too', () => {
  const events = [
    { company_name: 'Acme', channel: 'email', outcome: 'sent', created_at: at(16, 0) },
    { company_name: 'acme ', channel: 'email', outcome: 'sent', created_at: at(22, 23) },
    { company_name: 'Globex', channel: 'whatsapp', outcome: 'sent', created_at: at(23, 0) },     // next week
    { company_name: 'Old', channel: 'email', outcome: 'sent', created_at: at(9) },               // week before
    { company_name: 'Acme', channel: 'email', outcome: 'replied', created_at: at(18) },
    { company_name: 'Acme', channel: 'email', outcome: 'replied', created_at: at(19) },
  ];
  const r = buildReport({ ...empty, events }, from);
  assert.equal(value(r, 'Outreach', 'Messages sent').now, 2);
  assert.equal(value(r, 'Outreach', 'Messages sent').before, 1);
  assert.equal(value(r, 'Outreach', 'Companies contacted').now, 1);
  assert.equal(value(r, 'Outreach', 'Companies that replied').now, 1);
});

test('won and lost follow the stage types and the closing date; deleted deals are left out', () => {
  const deals = [
    { title: 'A', stage: 'signed', value: 100, created_at: at(1), closed_at: at(17) }, { title: 'B', stage: 'lost', created_at: at(17), closed_at: at(18) },
    { title: 'C', stage: 'lead', value: 50, created_at: at(17) }, { title: 'D', stage: 'signed', value: 900, created_at: at(17), closed_at: at(17), deleted_at: at(18) },
  ];
  const r = buildReport({ ...empty, deals, wonStages: ['signed'] }, from);
  assert.equal(value(r, 'Pipeline', 'Value won').now, 100);
  assert.equal(value(r, 'Pipeline', 'Deals lost').now, 1);
  assert.equal(value(r, 'Pipeline', 'New deals').now, 2);
  assert.equal(value(r, 'Pipeline', 'Value of new deals').now, 50);
});

test('a source that is not there is named, not shown as zero; campaigns appear only when used', () => {
  const r = buildReport({ ...empty, events: null, calls: null }, from);
  assert.deepEqual(r.missing, ['outreach results', 'calls']);
  assert.ok(!r.sections.some((s) => s.title === 'Outreach' || s.title === 'Calls' || s.title === 'Email campaigns'));
  const used = buildReport({ ...empty, campaigns: [{ sent_at: at(17), opened_at: at(18), clicked_at: null }] }, from);
  assert.equal(value(used, 'Email campaigns', 'Opened').now, 1);
});

test('the text to paste', () => {
  const r = buildReport({ ...empty, tasks: [{ done_at: at(17) }], deals: [{ title: 'Big', stage: 'won', value: 10, created_at: at(17), closed_at: at(17) }] }, from);
  const text = reportText(r, 'Weekly results', (v) => `Rs ${v}`);
  assert.match(text, /Tasks completed: 1 \(up from 0\)/);
  assert.match(text, /Value won: Rs 10 \(up from Rs 0\)/);
  assert.match(text, /Won: Big/);
});

// Run with:  node --test tests/import_exports.test.mjs      (from raptor-app/)
// Files as HubSpot and Zoho CRM export them (made-up people), read by the importer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { suggestSetup } from '../src/lib/import/columnGuess.ts';
import { parseTables, planImport } from '../src/lib/import/plan.ts';

const OPTS = { dateOrder: 'ambiguous', extraPlaceholders: new Set(), stageMap: { 'closed won': 'won' }, stageKeys: new Set(['lead', 'won']), defaultStage: 'lead' };
const empty = () => ({ companies: [], contacts: [], deals: [], jobTitle: true, defs: { company: new Map(), contact: new Map(), deal: new Map() } });
let n = 0;

function read(rows) {
  const table = analyseSheet('S', false, rows);
  const { suggestions, rowKind } = suggestSetup(table);
  const mapped = Object.fromEntries(suggestions.map((s) => [s.header, s.guess.field]));
  const plan = planImport(parseTables([{ table, choices: suggestions.map((s) => ({ field: s.guess.field })), rowKind }], OPTS), empty(), {}, () => `id${++n}`);
  return { mapped, rowKind, plan };
}

test('HubSpot contacts: the owner is not a contact and a lead status is not a deal', () => {
  const { mapped, rowKind, plan } = read([
    ['Record ID', 'First Name', 'Last Name', 'Email', 'Phone Number', 'Job Title', 'Company name', 'Contact owner', 'Lead Status', 'Create Date'],
    ['101', 'Asha', 'Rao', 'asha@acme.com', '+91 98765 43210', 'CTO', 'Acme Pvt Ltd', 'Ben Roy', 'OPEN', '2026-01-02 10:00'],
    ['102', 'Ravi', 'Kumar', 'ravi@beta.com', '+91 91234 56780', 'Manager', 'Beta Inc', 'Ben Roy', 'NEW', '2026-01-05 10:00']]);
  assert.equal(rowKind, 'contact');
  assert.equal(mapped['Contact owner'], 'custom');
  assert.equal(mapped['Lead Status'], 'custom');
  assert.deepEqual(plan.contacts.create.map((c) => [c.rec.name, c.rec.email, c.rec.job_title]), [['Asha Rao', 'asha@acme.com', 'CTO'], ['Ravi Kumar', 'ravi@beta.com', 'Manager']]);
  assert.equal(plan.deals.create.length, 0);
});

test('HubSpot deals: the close date and the associated person come across', () => {
  const { mapped, rowKind, plan } = read([
    ['Record ID', 'Deal Name', 'Amount', 'Deal Stage', 'Close Date', 'Associated Company', 'Associated Contact', 'Deal owner'],
    ['9', 'Acme renewal', '120000', 'Closed Won', '2026-03-25', 'Acme Pvt Ltd', 'Asha Rao (asha@acme.com)', 'Ben'],
    ['10', 'Beta pilot', '5000', 'Appointment Scheduled', '2026-04-18', 'Beta Inc', 'Ravi Kumar (ravi@beta.com)', 'Ben']]);
  assert.equal(rowKind, 'deal');
  assert.deepEqual([mapped['Close Date'], mapped['Associated Contact'], mapped['Associated Company']], ['deal.expected_close', 'contact.name', 'company.name']);
  const d = plan.deals.create[0].rec;
  assert.deepEqual([d.title, d.value, d.stage, d.expected_close], ['Acme renewal', 120000, 'won', '2026-03-25']);
  const c = plan.contacts.create[0].rec;
  assert.deepEqual([c.name, c.email, c.job_title], ['Asha Rao', 'asha@acme.com', undefined]);
});

test('Zoho contacts: both phone columns are kept', () => {
  const { mapped, plan } = read([
    ['Record Id', 'Contact Owner', 'First Name', 'Last Name', 'Account Name', 'Email', 'Title', 'Phone', 'Mobile', 'Mailing City'],
    ['zcrm_1', 'Ben', 'Asha', 'Rao', 'Acme Pvt Ltd', 'asha@acme.com', 'CTO', '020 1234 5678', '+91 98765 43210', 'Pune'],
    ['zcrm_2', 'Ben', 'Ravi', 'Kumar', 'Beta Inc', 'ravi@beta.com', 'Manager', '', '+91 91234 56780', 'Delhi']]);
  assert.equal(mapped['Contact Owner'], 'custom');
  const [asha, ravi] = plan.contacts.create.map((c) => c.rec);
  assert.equal(asha.phone, '020 1234 5678');
  assert.match(asha.custom['Other phones'], /98765/);
  assert.match(ravi.phone, /91234/);
});

test('Zoho deals and accounts', () => {
  const deals = read([
    ['Record Id', 'Deal Owner', 'Amount', 'Deal Name', 'Closing Date', 'Account Name', 'Stage', 'Contact Name'],
    ['zcrm_5', 'Ben', '120000', 'Acme renewal', '2026-03-25', 'Acme Pvt Ltd', 'Closed Won', 'Asha Rao'],
    ['zcrm_6', 'Ben', '5000', 'Beta pilot', '2026-04-18', 'Beta Inc', 'Qualification', 'Ravi Kumar']]);
  assert.deepEqual(deals.plan.deals.create.map((d) => [d.rec.title, d.rec.expected_close]), [['Acme renewal', '2026-03-25'], ['Beta pilot', '2026-04-18']]);
  const accounts = read([
    ['Record Id', 'Account Owner', 'Account Name', 'Phone', 'Website', 'Industry', 'Billing City', 'Billing Street'],
    ['zcrm_8', 'Ben', 'Acme Pvt Ltd', '020 1234 5678', 'acme.com', 'Software', 'Pune', '1 MG Road'],
    ['zcrm_9', 'Ben', 'Beta Inc', '011 2345 6789', 'beta.com', 'Retail', 'Delhi', '2 Ring Road']]);
  assert.equal(accounts.rowKind, 'company');
  assert.deepEqual(accounts.plan.companies.create.map((c) => [c.rec.name, c.rec.city, c.rec.industry]), [['Acme Pvt Ltd', 'Pune', 'Software'], ['Beta Inc', 'Delhi', 'Retail']]);
  assert.equal(accounts.plan.contacts.create.length, 0);
});

test('a deal value with no deal name is kept as an extra field, not dropped', () => {
  const { mapped } = read([['Company', 'Revenue'], ['Acme', '100'], ['Beta', '200'], ['Gamma', '300']]);
  assert.equal(mapped.Revenue, 'custom');
});

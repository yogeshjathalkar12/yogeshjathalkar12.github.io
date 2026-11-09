// Run with:  node --test tests/import_plan.test.mjs      (from raptor-app/)
// The import PLAN: merging inside the file, matching what is already in the CRM, suggestions, deals and stages, and random
// files that must always give a consistent plan. No network, no files written. The owner's own sample files (if on this PC)
// are extra input at the end, never the rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyseSheet } from '../src/lib/import/sheetShape.ts';
import { suggestSetup } from '../src/lib/import/columnGuess.ts';
import { readWorkbookBuffer } from '../src/lib/import/xlsxRead.ts';
import { normalizeCompanyName } from '../src/lib/import/values.ts';
import { parseTables, planImport, findSuggestions, applyFileLinks, suggestStage, guessRowKind, distinctValues } from '../src/lib/import/plan.ts';

const OPTS = { dateOrder: 'ambiguous', extraPlaceholders: new Set(), stageMap: {}, stageKeys: new Set(['lead', 'meeting', 'negotiation', 'won', 'lost']), defaultStage: 'lead' };
const NO_EXISTING = () => ({ companies: [], contacts: [], deals: [], defs: { company: new Map(), contact: new Map(), deal: new Map() } });
let seq = 0;
const ids = () => `id-${++seq}`;

function setupOf(name, rows, overrides = {}) {
  const table = analyseSheet(name, false, rows);
  const { suggestions, rowKind } = suggestSetup(table);
  const choices = suggestions.map((s) => ({ field: overrides[s.header] ?? s.guess.field }));
  return { table, choices, rowKind: overrides.__kind ?? rowKind };
}
const parse = (setups, opts = OPTS) => parseTables(Array.isArray(setups) ? setups : [setups], opts);
const exCompany = (o) => ({ id: o.id, name: o.name, website_url: null, phone: null, email: null, address: null, city: null, industry: null, description: null, custom_fields: null, created_at: '2026-01-01', ...o });
const exContact = (o) => ({ id: o.id, name: o.name, email: null, phone: null, company_id: null, first_name: null, last_name: null, linkedin_url: null, custom_fields: null, ...o });

const COMPANY_HDR = ['Company Name', 'Region', 'HR Name', 'Email', 'Contact Number', 'Address', 'Address Status', 'Website'];
function companyRows(extra = []) {
  return [COMPANY_HDR,
    ['SuMax Enterprises Pvt. Ltd.', 'Pune', 'Mr. Anil Kumar (Head – HR)', 'a@sumax.com; b@sumax.com', '-65794813.1978022', 'Plot 1, Lane 4', 'Verified', 'www.sumax.com'],
    ['Harnex Systems Pvt. Ltd.', 'Pune', '', '', '', 'Address not found', 'Not found - verify', ''],
    ['KION India Private Limited', 'Pune', 'Priya Nair', 'p.nair@kion.com', '+91 98765 43210 / 020 2567 1234', 'Gate 2', 'Verified', 'kion.com'],
    ['sumax enterprises', 'Pune', '', 'sales@sumax.com', '9876501234', '', '', ''],
    ['Zed Corp', 'Mumbai', '', '', '', '', '', ''],
    ...extra];
}

test('a company list: duplicates inside the file merge, several emails/phones are all kept, damage is dropped with a note', () => {
  const p = parse(setupOf('S', companyRows()));
  assert.equal(p.rowsRead, 5);
  assert.equal(p.companies.size, 4);                       // SuMax merged with "sumax enterprises"
  assert.equal(p.merged.companies, 1);
  const sumax = p.companies.get(normalizeCompanyName('SuMax Enterprises'));
  assert.equal(sumax.email, 'a@sumax.com');
  assert.deepEqual(sumax.custom['Other emails'].split('; ').sort(), ['b@sumax.com', 'sales@sumax.com']);
  assert.equal(sumax.phone, '9876501234');                 // the damaged first phone was dropped, the second row's real one used
  assert.ok(p.outcomes.some((o) => o.status === 'fixed' && o.messages.some((m) => /phone/i.test(m) && /Excel/.test(m))));
  const harnex = p.companies.get(normalizeCompanyName('Harnex Systems'));
  assert.equal(harnex.address, undefined);                 // "Address not found" is empty, not an address
  const kion = p.companies.get(normalizeCompanyName('KION India'));
  assert.equal(kion.phone, '+91 98765 43210');
  assert.equal(kion.custom['Other phones'], '020 2567 1234');
  assert.equal(kion.domain, 'kion.com');
});

test('a contact is made from a name cell: honorific split off, role kept, email attached, company linked', () => {
  const p = parse(setupOf('S', companyRows(), { Email: 'contact.email', 'Contact Number': 'contact.phone' }));
  const anil = [...p.contacts.values()].find((c) => c.name === 'Anil Kumar');
  assert.ok(anil);
  assert.equal(anil.custom['Job title'], 'Head – HR');
  assert.equal(anil.email, 'a@sumax.com');
  assert.equal(anil.otherEmails.includes('b@sumax.com'), true);
  assert.equal(anil.companyKey, normalizeCompanyName('SuMax Enterprises'));
});

test('against an empty CRM everything is created, parents before children, custom fields announced', () => {
  const p = parse(setupOf('S', companyRows()));
  const plan = planImport(p, NO_EXISTING(), {}, ids);
  assert.equal(plan.companies.create.length, 4);
  assert.equal(plan.companies.update.length, 0);
  assert.ok(plan.newCustomFields.some((f) => f.entity === 'company' && f.name === 'Other emails'));
  assert.ok(plan.newCustomFields.some((f) => f.entity === 'contact' && f.name === 'Job title'));
  const created = new Set(plan.companies.create.map((c) => c.id));
  for (const c of plan.contacts.create) assert.ok(c.companyId === null || created.has(c.companyId));
});

test('an existing company is updated by filling EMPTY fields only; what is there is never overwritten', () => {
  const ex = NO_EXISTING();
  ex.companies = [exCompany({ id: 'c1', name: 'KION India Pvt Ltd', phone: '000 111', city: null })];
  const plan = planImport(parse(setupOf('S', companyRows())), ex, {}, ids);
  const upd = plan.companies.update.find((u) => u.id === 'c1');
  assert.ok(upd);
  assert.equal(upd.patch.phone, undefined);                // had a phone: kept
  assert.equal(upd.patch.email, 'p.nair@kion.com');          // it had no email: filled
  assert.equal(upd.patch.website_url, 'https://kion.com');
  assert.equal(upd.patch.address, 'Gate 2');
  assert.ok(!plan.companies.create.some((c) => c.rec.key === normalizeCompanyName('KION India')));
});

test('an existing company with nothing new is counted unchanged, not rewritten', () => {
  const ex = NO_EXISTING();
  ex.companies = [exCompany({ id: 'c9', name: 'Zed Corporation', website_url: 'x', phone: 'x', email: 'x', address: 'x', city: 'x', industry: 'x', description: 'x' })];
  const rows = [['Company', 'City'], ['Zed Corp', 'Mumbai'], ['Other One', 'Delhi'], ['Third', 'Delhi'], ['Fourth', 'Goa'], ['Fifth', 'Goa']];
  const plan = planImport(parse(setupOf('S', rows)), ex, {}, ids);
  assert.equal(plan.companies.unchanged, 1);
  assert.equal(plan.companies.update.length, 0);
  assert.equal(plan.companies.create.length, 4);
});

test('near matches are suggested, never merged by themselves; a decision merges them', () => {
  const rows = [['Company', 'City'], ['Xpressbees', 'Pune'], ['Xpressbee Tech Hub', 'Pune'], ['Whizmo', 'Pune'], ['Whizmo Tech', 'Pune'], ['Unrelated Ltd', 'Pune'], ['Another Co', 'Pune']];
  const p = parse(setupOf('S', rows));
  assert.equal(p.companies.size, 6);                        // nothing merged on its own
  const sug = findSuggestions(p, NO_EXISTING());
  assert.equal(sug.length, 2);
  const x = sug.find((s) => /xpressbee/i.test(s.file.name));
  assert.ok(x);
  const merged = applyFileLinks(p, { [x.file.key]: { intoKey: x.other.key } });
  assert.equal(merged.companies.size, 5);
  assert.equal(planImport(merged, NO_EXISTING(), {}, ids).companies.create.length, 5);
});

test('a suggestion against the CRM can be accepted: the file row then updates that company', () => {
  const ex = NO_EXISTING();
  ex.companies = [exCompany({ id: 'c7', name: 'Xpressbees' })];
  const rows = [['Company', 'City'], ['Xpressbee Tech Hub', 'Pune'], ['B1', 'x'], ['B2', 'x'], ['B3', 'x'], ['B4', 'x']];
  const p = parse(setupOf('S', rows));
  const sug = findSuggestions(p, ex);
  assert.equal(sug.length, 1);
  assert.deepEqual(sug[0].other, { kind: 'existing', id: 'c7', name: 'Xpressbees' });
  assert.equal(planImport(p, ex, {}, ids).companies.create.length, 5);                       // by default: separate
  const linked = planImport(p, ex, { [sug[0].file.key]: { existingId: 'c7' } }, ids);
  assert.equal(linked.companies.create.length, 4);
  assert.equal(linked.companies.update.find((u) => u.id === 'c7').patch.city, 'Pune');
});

test('the same website under two names is suggested, not merged', () => {
  const rows = [['Company', 'Website'], ['Alpha Industries', 'alpha.com'], ['Beta Holdings', 'www.alpha.com/about'], ['C', 'c.com'], ['D', 'd.com'], ['E', 'e.com']];
  const sug = findSuggestions(parse(setupOf('S', rows)), NO_EXISTING());
  assert.equal(sug.length, 1);
  assert.equal(sug[0].reason, 'same website');
});

test('contacts: matched by email, else by name inside the same company; only empty fields are filled', () => {
  const ex = NO_EXISTING();
  ex.companies = [exCompany({ id: 'c1', name: 'Acme' })];
  ex.contacts = [exContact({ id: 'p1', name: 'Rita Shah', email: 'rita@acme.com', phone: null, company_id: null }), exContact({ id: 'p2', name: 'Dev Rao', company_id: 'c1', phone: '5' })];
  const rows = [['First Name', 'Last Name', 'Email', 'Phone', 'Company'],
    ['Rita', 'Shah', 'RITA@acme.com', '99999 11111', 'Acme'], ['Dev', 'Rao', '', '88888 22222', 'Acme'], ['Dev', 'Rao', '', '77777', 'Other Co'],
    ['New', 'Person', 'new@x.com', '', ''], ['N2', 'P2', 'n2@x.com', '', ''], ['N3', 'P3', 'n3@x.com', '', '']];
  const plan = planImport(parse(setupOf('S', rows)), ex, {}, ids);
  const rita = plan.contacts.update.find((u) => u.id === 'p1');
  assert.equal(rita.patch.phone, '99999 11111');
  assert.equal(rita.patch.company_id, 'c1');
  assert.deepEqual(Object.keys(plan.contacts.update.find((u) => u.id === 'p2').patch).sort(), ['first_name', 'last_name']);   // the phone was already there: kept
  assert.equal(plan.contacts.unchanged, 0);
  assert.ok(plan.contacts.create.some((c) => c.rec.name === 'Dev Rao' && c.companyId !== 'c1'));   // same name, another company = another person
  assert.equal(plan.contacts.create.length, 4);                                            // Dev Rao at Other Co + three new people
});

test('several people in one cell with a matching number of emails are paired in order', () => {
  const rows = [['Company', 'Contact', 'Email'], ['A Co', 'Asha Rao; Vik Shah', 'asha@a.com; vik@a.com'], ['B', 'x y', 'b@b.com'], ['C', 'x z', 'c@c.com'], ['D', 'q w', 'd@d.com'], ['E', 'r t', 'e@e.com']];
  const p = parse(setupOf('S', rows, { Contact: 'contact.name', Email: 'contact.email' }));
  const people = [...p.contacts.values()].filter((c) => c.companyKey === normalizeCompanyName('A Co'));
  assert.deepEqual(people.map((c) => [c.name, c.email]), [['Asha Rao', 'asha@a.com'], ['Vik Shah', 'vik@a.com']]);
});

test('deals: stages mapped, values parsed, bad stage/value reported, duplicates skipped', () => {
  const rows = [['Opportunity', 'Amount', 'Stage', 'Account'], ['Big one', '$12,500', 'Won', 'Acme'], ['Small', 'abc', 'Qualified', 'Acme'], ['Mid', '4k', 'Negotiation', 'Zed'], ['Big one', '1', 'Won', 'Acme'], ['Old', '5', 'lead', 'Acme'], ['More', '6', 'lead', 'Acme']];
  const opts = { ...OPTS, stageMap: { qualified: 'meeting' } };
  const ex = NO_EXISTING();
  ex.companies = [exCompany({ id: 'c1', name: 'Acme' })];
  ex.deals = [{ id: 'd1', title: 'Old', company_id: 'c1' }];
  const plan = planImport(parse(setupOf('S', rows), opts), ex, {}, ids);
  const byTitle = Object.fromEntries(plan.deals.create.map((d) => [d.rec.title, d]));
  assert.equal(byTitle['Big one'].rec.value, 12500);
  assert.equal(byTitle['Big one'].rec.stage, 'won');
  assert.equal(byTitle.Small.rec.stage, 'meeting');
  assert.equal(byTitle.Small.rec.value, 0);
  assert.equal(byTitle.Mid.rec.value, 4000);
  assert.equal(byTitle['Big one'].companyId, 'c1');
  assert.equal(plan.deals.skipped, 2);                                                      // the repeated "Big one" and the existing "Old"
  assert.ok(plan.outcomes.some((o) => o.messages.some((m) => /value left at 0/i.test(m))));
  const unknown = parse(setupOf('S', rows));
  assert.ok(unknown.outcomes.some((o) => o.messages.some((m) => /no match in your pipeline/.test(m))));
});

test('stage suggestions use the pipeline the account really has', () => {
  const stages = [{ key: 'new', label: 'Fresh', type: 'open' }, { key: 'demo', label: 'Demo Done', type: 'open' }, { key: 'closed', label: 'Closed Won', type: 'won' }, { key: 'dead', label: 'Dead', type: 'lost' }];
  assert.equal(suggestStage('Closed Won', stages), 'closed');
  assert.equal(suggestStage('won', stages), 'closed');
  assert.equal(suggestStage('Lost', stages), 'dead');
  assert.equal(suggestStage('demo', stages), 'demo');
  assert.equal(suggestStage('Prospect', stages), 'new');
  assert.equal(suggestStage('Qualified', stages), null);
});

test('rows without what the table needs are set aside with a reason, never silently', () => {
  const rows = [['Company', 'City'], ['A', 'x'], ['', 'Pune'], ['B', 'x'], ['C', 'x'], ['D', 'x'], ['E', 'x']];
  const p = parse(setupOf('S', rows));
  assert.equal(p.companies.size, 5);
  const skipped = p.outcomes.filter((o) => o.status === 'skipped');
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].row, 3);
  assert.match(skipped[0].messages[0], /company name/);
});

test('two tables (sheets) are merged into one company book; custom columns follow their entity', () => {
  const a = setupOf('Master', [['ID', 'Startup Name', 'Sales Cycle'], ['1', 'CargoFL', '3-6 Months'], ['2', 'Peer Robotics', '3–6 Months'], ['3', 'KloudMate', '1-2 Months'], ['4', 'Z', '1'], ['5', 'Y', '2']]);
  const b = setupOf('Addresses', [['ID', 'Startup Name', 'Office Address'], ['1', 'Cargo FL Pvt Ltd', 'Balaji Chowk'], ['2', 'Peer Robotics', 'NCL'], ['3', 'KloudMate Inc', 'Baner'], ['4', 'Q', 'x'], ['5', 'R', 'y']]);
  const p = parse([a, b]);
  assert.equal(p.rowsRead, 10);
  assert.equal(p.companies.size, 8);                       // "CargoFL" and "Cargo FL Pvt Ltd" stay separate: suggested, not merged
  assert.equal(p.companies.get('peer robotics').address, 'NCL');
  assert.equal(p.companies.get('peer robotics').custom['Sales Cycle'], '3–6 Months');
  assert.equal(p.companies.get('kloudmate').address, 'Baner');
  assert.ok(findSuggestions(p, NO_EXISTING()).some((s) => /cargo/i.test(s.file.name)));
});

test('distinctValues lists what a column holds, for the value-mapping step', () => {
  const s = setupOf('S', [['Opportunity', 'Stage'], ['a', 'Won'], ['b', 'Won'], ['c', 'Lost'], ['d', 'Lead'], ['e', 'Lead']]);
  assert.deepEqual(distinctValues([s], 'deal.stage'), [{ value: 'Won', count: 2 }, { value: 'Lead', count: 2 }, { value: 'Lost', count: 1 }]);
});

// ---------------------------------------------------------------- random files must always produce a consistent plan
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'omega', 'zenith', 'apex', 'nova', 'terra', 'orbit', 'quanta', 'vertex', 'lumen', 'cobalt', 'ember'];
const SUFFIX = ['', ' Pvt. Ltd.', ' Inc', ' LLC', ' Limited', ', Inc.', ' & Co', ' GmbH'];
test('random files (8 seeds): consistent plans, merged exactly by normalised name, no orphans, nothing invented', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const r = rng(seed);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const base = Array.from({ length: 25 }, (_, i) => `${pick(WORDS)} ${pick(WORDS)} ${i % 7}`);
    const n = 40 + Math.floor(r() * 60);
    const rows = [['Organisation', 'E-mail', 'Tel', 'Contact', 'Town']];
    const expectedKeys = new Set();
    for (let i = 0; i < n; i++) {
      let name = pick(base) + pick(SUFFIX);
      if (r() < 0.3) name = name.toUpperCase();
      if (r() < 0.2) name = ' ' + name + '  ';
      expectedKeys.add(normalizeCompanyName(name));
      rows.push([name, r() < 0.5 ? `${pick(WORDS)}@${pick(WORDS)}.com; ${pick(WORDS)}@${pick(WORDS)}.org` : r() < 0.5 ? 'N/A' : '', r() < 0.4 ? `9${Math.floor(r() * 1e9)}` : r() < 0.2 ? `-${Math.floor(r() * 1e8)}.5` : '', r() < 0.3 ? `Mr. ${pick(WORDS)} ${pick(WORDS)}` : '', pick(['Pune', 'Delhi', '', 'Address not found'])]);
    }
    const ex = NO_EXISTING();
    const some = [...expectedKeys].slice(0, 6);
    ex.companies = some.map((k, i) => exCompany({ id: `ex${i}`, name: k.toUpperCase() + ' Ltd' }));
    const p = parse(setupOf('S', rows));
    const plan = planImport(p, ex, {}, ids);
    assert.equal(p.companies.size, expectedKeys.size, `seed ${seed}: companies in file`);
    assert.equal(plan.companies.create.length + plan.companies.update.length + plan.companies.unchanged, expectedKeys.size, `seed ${seed}: every company is created, updated or unchanged`);
    assert.equal(plan.companies.update.length + plan.companies.unchanged, some.length, `seed ${seed}: existing ones matched by key`);
    assert.equal(new Set(plan.companies.create.map((c) => c.rec.key)).size, plan.companies.create.length, `seed ${seed}: no duplicate creates`);
    const known = new Set([...plan.companies.create.map((c) => c.id), ...ex.companies.map((c) => c.id)]);
    for (const c of plan.contacts.create) assert.ok(c.companyId === null || known.has(c.companyId), `seed ${seed}: contact points at a real company`);
    for (const c of p.companies.values()) {
      if (c.phone) assert.ok(!/^-/.test(c.phone) && !/\.5$/.test(c.phone), `seed ${seed}: no damaged phone stored`);
      assert.ok(!/^n\/a$/i.test(c.email || ''), `seed ${seed}: no placeholder stored`);
      if (c.city) assert.ok(!/not found/i.test(c.city));
    }
    assert.equal(p.rowsRead, n);
    assert.equal(p.rowsUsed + p.outcomes.filter((o) => o.status === 'skipped').length, n, `seed ${seed}: every row accounted for`);
  }
});

// ---------------------------------------------------------------- the owner's files, if present (extra input only)
const OWNER = ['C:/Users/Asus/Desktop/raptor  kampany list - verified.xlsx', 'C:/Users/Asus/Downloads/Pune_Startups_Master_200.xlsx', 'C:/Users/Asus/Desktop/Book1.xlsx'];
test('the owner\'s three files together give a sane company plan (when on this PC)', async (t) => {
  if (!OWNER.every((f) => fs.existsSync(f))) return t.skip('sample files not on this PC');
  const setups = [];
  for (const f of OWNER) {
    const b = fs.readFileSync(f);
    const sheets = await readWorkbookBuffer(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), f);
    for (const s of sheets) {
      if (/Summary|Duplicates/.test(s.name)) continue;
      const tb = analyseSheet(s.name, s.hidden, s.rows);
      if (tb.verdict !== 'list') continue;
      const ch = suggestSetup(tb).suggestions.map((m) => ({ field: m.guess.field }));
      if (!ch.some((c) => c.field === 'company.name')) continue;
      setups.push({ table: tb, choices: ch, rowKind: 'company' });
    }
  }
  const p = parse(setups);
  const plan = planImport(p, NO_EXISTING(), {}, ids);
  assert.ok(p.rowsRead > 900);
  assert.ok(p.companies.size < p.rowsRead, 'companies shared between sheets/files are merged');
  assert.ok(p.companies.size > 400);
  for (const c of p.companies.values()) {
    assert.ok(!c.phone || !/^-/.test(c.phone), 'no Excel-damaged phone');
    assert.ok(!/^(address )?not found/i.test(c.address || ''), 'no placeholder address');
  }
  assert.equal(plan.companies.create.length, p.companies.size);
  assert.ok(findSuggestions(p, NO_EXISTING()).length >= 1, 'near-duplicates are suggested, not merged');
});

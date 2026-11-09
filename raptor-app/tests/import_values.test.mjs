// Run with:  node --test tests/import_values.test.mjs      (from raptor-app/)
// Cleaning rules of the import wizard. Every rule is tested with inputs from SEVERAL shapes of data, not one file's.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPlaceholder, cleanText, parseEmails, parsePhones, cleanOnePhone, parseUrl, registrableDomain,
  normalizeCompanyName, parsePeople, parseNumber, parseDate, inferDateOrder, nameSimilarity,
} from '../src/lib/import/values.ts';

test('placeholders are empty, real text is not', () => {
  for (const p of ['', ' ', '-', 'N/A', 'n/a', 'NA', 'Not found', 'Address not found', 'Not found - verify', 'email not available', 'No data', 'Unknown', '#N/A', 'null', '---', 'Unable to verify'])
    assert.equal(isPlaceholder(p), true, p);
  for (const p of ['Pune', 'Nagpur Road', 'Nilkamal', 'Natural Foods', 'Anand', 'None of Your Business Ltd', 'Not Just Toys', 'Verified address'])
    assert.equal(isPlaceholder(p), false, p);
});

test('cleanText trims, collapses spaces and removes placeholders; extra placeholders work', () => {
  assert.equal(cleanText('  Acme   Corp  '), 'Acme Corp');
  assert.equal(cleanText('Address not found'), '');
  assert.equal(cleanText('see site', new Set(['see site'])), '');
  assert.equal(cleanText(null), '');
});

test('emails: first is primary, the rest are kept, nothing is dropped, junk is reported', () => {
  assert.deepEqual(parseEmails('a@x.com; B@Y.com / c@z.org'), { primary: 'a@x.com', others: ['b@y.com', 'c@z.org'], problems: [] });
  assert.equal(parseEmails('Anil <anil@acme.in>').primary, 'anil@acme.in');
  assert.deepEqual(parseEmails('a@x.com, a@x.com').others, []);
  assert.equal(parseEmails('info@sub.example.co.uk').primary, 'info@sub.example.co.uk');
  assert.equal(parseEmails('').primary, null);
  assert.equal(parseEmails('Not found - verify').primary, null);
  const bad = parseEmails('call us');
  assert.equal(bad.primary, null);
  assert.equal(bad.problems.length, 1);
});

test('phones: several in one cell, formats kept, Excel damage rejected', () => {
  assert.deepEqual(parsePhones('+91 98765 43210 / 020 2567 1234'), { primary: '+91 98765 43210', others: ['020 2567 1234'], problems: [] });
  assert.equal(parsePhones('9876543210.0').primary, '9876543210');
  assert.equal(parsePhones('(555) 123-4567').primary, '(555) 123-4567');
  assert.equal(parsePhones('0044 20 7946 0958').primary, '+44 20 7946 0958');
  assert.equal(parsePhones('020-25671234 ext 12').primary, '020-25671234');
  assert.deepEqual(parsePhones('98765 43210; 98765 43210').others, []);
  const garbage = parsePhones('-65794813.1978022');
  assert.equal(garbage.primary, null);
  assert.equal(garbage.problems.length, 1);
  assert.match(parsePhones('9.87654E+11').problems[0], /scientific/);
  assert.equal(parsePhones('12345').primary, null);
  assert.equal(parsePhones('1234567890123456789').primary, null);
  assert.equal(parsePhones('call reception').primary, null);
  assert.equal(parsePhones('Not found').primary, null);
  assert.ok('value' in cleanOnePhone('+1 415 555 0100'));
});

test('web addresses and domains', () => {
  assert.equal(parseUrl('www.acme.in/about').url, 'https://www.acme.in/about');
  assert.equal(parseUrl('www.acme.in/about').domain, 'acme.in');
  assert.equal(parseUrl('https://shop.acme.co.uk/x').domain, 'acme.co.uk');
  assert.equal(parseUrl('http://foo.example.com').domain, 'example.com');
  assert.equal(parseUrl('a@b.com').url, null);
  assert.equal(parseUrl('not a site').url, null);
  assert.equal(parseUrl('Not found').url, null);
  assert.equal(parseUrl('Not found').problems.length, 0);
  assert.equal(registrableDomain('WWW.Example.COM.'), 'example.com');
  assert.equal(registrableDomain('localhost'), null);
});

test('company names: the same company in different spellings shares a key, different companies do not', () => {
  const same = [
    ['SuMax Enterprises Pvt. Ltd.', 'sumax enterprises private limited'],
    ['Acme, Inc.', 'ACME'],
    ['Tata & Sons Ltd', 'Tata and Sons'],
    ['The Hindu Group', 'Hindu Group'],
    ['Müller GmbH', 'Muller'],
    ['Peer Robotics (Pune)', 'Peer Robotics'],
  ];
  for (const [a, b] of same) assert.equal(normalizeCompanyName(a), normalizeCompanyName(b), `${a} / ${b}`);
  assert.notEqual(normalizeCompanyName('Acme Steel'), normalizeCompanyName('Acme Software'));
  assert.notEqual(normalizeCompanyName('Xpressbees'), normalizeCompanyName('Xpressbee Tech Hub'));
  assert.equal(normalizeCompanyName('Ltd'), 'ltd'); // never an empty key
});

test('near duplicates are suggested but exact normalised matches score 1', () => {
  assert.equal(nameSimilarity('acme', 'acme'), 1);
  assert.ok(nameSimilarity(normalizeCompanyName('Xpressbee Tech Hub'), normalizeCompanyName('Xpressbees')) >= 0.6);
  assert.ok(nameSimilarity('xpressbees', 'xpressbee tech hub') >= 0.6);
  assert.ok(nameSimilarity('whizmo tech', 'whizmo') >= 0.8);
  assert.ok(nameSimilarity('acme steel', 'zenith bank') < 0.5);
  assert.equal(nameSimilarity('ab', 'ac'), 0);
  // numbers and single letters are identity, not typos
  assert.equal(nameSimilarity('sample co 0 llc', 'sample co 1 llc'), 0);
  assert.equal(nameSimilarity('plant 2 steel works', 'plant 3 steel works'), 0);
  assert.equal(nameSimilarity('phase a holdings', 'phase b holdings'), 0);
  assert.ok(nameSimilarity('plant 2 steel works', 'plant 2 steel work') >= 0.8);
});

test('people: honorifics and roles are separated, several people in one cell are split', () => {
  assert.deepEqual(parsePeople('Mr. Anil Kumar (Head – HR)').people[0], { name: 'Anil Kumar', first: 'Anil', last: 'Kumar', role: 'Head – HR', honorific: 'Mr' });
  assert.equal(parsePeople('Dr Sarah J. Lee').people[0].name, 'Sarah J. Lee');
  assert.equal(parsePeople('Priya Nair - HR Manager').people[0].role, 'HR Manager');
  assert.equal(parsePeople('Priya Nair - HR Manager').people[0].name, 'Priya Nair');
  assert.equal(parsePeople('Rahul').people[0].last, '');
  const two = parsePeople('Asha Rao; Vikram Shah (CEO)\nNot found');
  assert.deepEqual(two.people.map((p) => p.name), ['Asha Rao', 'Vikram Shah']);
  assert.equal(parsePeople('Address not found').people.length, 0);
  assert.equal(parsePeople('Mr.').people.length, 0);
});

test('numbers: currency and separators in several conventions, nothing guessed silently', () => {
  const cases = [['₹ 1,20,000', 120000], ['$12.5k', 12500], ['1.234,56', 1234.56], ['1,234.56', 1234.56], ['(500)', -500], ['-42', -42], ['1,234', 1234], ['12,5', 12.5], ['Rs. 7,500', 7500], ['2M', 2000000], ['0', 0], ['1.234.567', 1234567]];
  for (const [raw, want] of cases) assert.equal(parseNumber(raw).value, want, raw);
  assert.equal(parseNumber('abc').value, null);
  assert.ok(parseNumber('abc').problem);
  assert.equal(parseNumber('').problem, null);
  assert.equal(parseNumber('N/A').value, null);
});

test('dates: order is inferred from the column, ambiguity is reported, formats vary', () => {
  assert.equal(parseDate('2026-11-09').value, '2026-11-09');
  assert.equal(parseDate('2026-11-09 14:30:00').value, '2026-11-09');
  assert.equal(parseDate('13/11/2026').value, '2026-11-13');
  assert.equal(parseDate('11/13/2026').value, '2026-11-13');
  assert.deepEqual(parseDate('03/04/2026'), { value: '2026-04-03', ambiguous: true, problem: null });
  assert.equal(parseDate('03/04/2026', 'mdy').value, '2026-03-04');
  assert.equal(parseDate('03/04/2026', 'dmy').ambiguous, false);
  assert.equal(parseDate('9 Nov 2026').value, '2026-11-09');
  assert.equal(parseDate('November 9, 2026').value, '2026-11-09');
  assert.equal(parseDate('31/02/2026').value, null);
  assert.ok(parseDate('someday').problem);
  assert.equal(inferDateOrder(['03/04/2026', '25/04/2026']), 'dmy');
  assert.equal(inferDateOrder(['03/04/2026', '04/25/2026']), 'mdy');
  assert.equal(inferDateOrder(['03/04/2026', '05/06/2026']), 'ambiguous');
  assert.equal(inferDateOrder(['2026-01-02']), 'ambiguous');
});

// Run with:  node --test tests/company_fields.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPANY_FIELDS, blankCompanyForm, companyToForm, formToCompany, filledCompanyDetails, cleanCustomValues } from '../src/lib/companyFields.ts';

test('every column the import fills is on the form', () => {
  assert.deepEqual(COMPANY_FIELDS.map((f) => f.key), ['phone', 'email', 'address', 'city', 'industry', 'description']);
});

test('a company row becomes form boxes and back, trimmed, with empty boxes stored as null', () => {
  const row = { name: ' Acme ', website_url: null, phone: '020 111', email: 'a@acme.com', address: null, city: ' Pune ', industry: '', description: 'Makes things' };
  const form = companyToForm(row);
  assert.equal(form.website_url, '');
  assert.equal(form.address, '');
  const back = formToCompany(form);
  assert.deepEqual(back, { name: 'Acme', website_url: null, phone: '020 111', email: 'a@acme.com', address: null, city: 'Pune', industry: null, description: 'Makes things' });
});

test('a missing name or a wrong email is refused in plain words', () => {
  assert.throws(() => formToCompany({ ...blankCompanyForm(), name: '  ' }), /Name is required/);
  assert.throws(() => formToCompany({ ...blankCompanyForm(), name: 'X', email: 'not-an-email' }), /not a valid email/);
  assert.doesNotThrow(() => formToCompany({ ...blankCompanyForm(), name: 'X', email: '' }));
});

test('a null company gives a blank form', () => {
  assert.deepEqual(companyToForm(null), blankCompanyForm());
});

test('the detail view lists only what has a value, in order', () => {
  const rows = filledCompanyDetails({ phone: '  ', email: 'a@b.co', address: 'Plot 1', city: null, industry: 'Logistics', description: 'x' });
  assert.deepEqual(rows.map((r) => r.key), ['email', 'address', 'industry', 'description']);
  assert.equal(rows.find((r) => r.key === 'address').multiline, true);
  assert.deepEqual(filledCompanyDetails(null), []);
});

test('custom values typed in the form: untouched fields are not stored', () => {
  assert.deepEqual(cleanCustomValues({ a: ' x ', b: '', c: '   ' }), { a: 'x' });
  assert.deepEqual(cleanCustomValues({}), {});
});

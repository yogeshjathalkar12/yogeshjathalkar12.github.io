// Run with:  node --test tests/custom_tags.test.mjs      (from raptor-app/)
// Step 8: custom fields as merge tags in the CRM email / text templates, and in the search boxes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tagSlug, customTags, previewFill } from '../src/lib/customTags.ts';
import { customSearchText } from '../src/lib/viewColumns.ts';

const def = (entity, name, sort = 0, created = '2026-01-01') => ({ id: `${entity}-${name}`, owner_id: 'o', entity_type: entity, name, field_type: 'text', options: null, sort_order: sort, created_at: created });

test('the slug is the one the database makes: lower case, other characters become one underscore', () => {
  assert.equal(tagSlug('Sales Cycle'), 'sales_cycle');
  assert.equal(tagSlug('Budget (INR)'), 'budget_inr');
  assert.equal(tagSlug('GST No.'), 'gst_no');
  assert.equal(tagSlug('  --  '), '');
  assert.equal(tagSlug('Größe'), 'gr_e');                                  // same as regexp_replace(lower(x), '[^a-z0-9]+', '_') in SQL
});

test('every field gets an entity-prefixed tag; two fields giving the same tag keep the first; a name with no letters or digits gets none', () => {
  const tags = customTags([def('company', 'Employees', 2), def('contact', 'Segment'), def('deal', 'Budget (INR)'), def('company', 'employees', 5), def('company', '###')]);
  assert.deepEqual(tags.map((t) => t.tag), ['contact.segment', 'deal.budget_inr', 'company.employees']);
  assert.equal(tags.find((t) => t.tag === 'company.employees').label, 'Employees (company)');
  assert.equal(tags.find((t) => t.tag === 'contact.segment').label, 'Segment (person)');
  assert.deepEqual(customTags([def('company', 'A', 1), def('company', 'a', 0)]).map((t) => t.label), ['a (company)']);   // sort order decides which one stays
});

test('the preview fills the standard tags with sample values, a custom tag with its field name, and drops everything else', () => {
  const tags = customTags([def('company', 'Employees')]);
  const out = previewFill('Hi {{first_name}} at {{ company }}: {{company.employees}} people, {{contact.nope}}{{deal_title}}', { first_name: 'Priya', company: 'Acme', deal_title: '' }, tags);
  assert.equal(out, 'Hi Priya at Acme: [Employees] people, ');
});

test('the search finds custom field values (numbers and texts), and skips empty ones', () => {
  assert.deepEqual(customSearchText({ a: 'Warm', b: 120, c: '', d: null, e: undefined }), ['Warm', '120']);
  assert.deepEqual(customSearchText(null), []);
  assert.deepEqual(customSearchText({}), []);
});

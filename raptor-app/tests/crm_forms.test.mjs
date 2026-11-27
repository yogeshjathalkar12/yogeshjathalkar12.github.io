// Run with:  node --test tests/crm_forms.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NEW_FORM, embedCode, formLink, formProblem, formRow } from '../src/lib/leadForms.ts';
import { isNotInstalled } from '../src/lib/dbMissing.ts';

test('the link and the website code point at the public page and nothing typed can break out of the code', () => {
  assert.equal(formLink('abc123'), 'https://shoonyaorigins.com/ventures/raptor/form.html?f=abc123');
  const code = embedCode({ ...NEW_FORM, token: 'abc123', title: 'Say "hi" <script>' });
  assert.match(code, /^<iframe src="https:\/\/shoonyaorigins\.com\/ventures\/raptor\/form\.html\?f=abc123&embed=1" title="Say &quot;hi&quot; &lt;script&gt;" /);
  assert.ok(!code.includes('<script'));
  const bare = embedCode({ ...NEW_FORM, token: 't', ask_company: false, ask_phone: false, ask_message: false });
  assert.ok(Number(code.match(/height:(\d+)px/)[1]) > Number(bare.match(/height:(\d+)px/)[1]));
});

test('a form is checked before it is saved', () => {
  assert.equal(formProblem(NEW_FORM), null);
  assert.match(formProblem({ ...NEW_FORM, name: '  ' }), /name/);
  assert.match(formProblem({ ...NEW_FORM, button_text: '' }), /button/);
  assert.match(formProblem({ ...NEW_FORM, intro: 'x'.repeat(501) }), /introduction/);
});

test('only the columns of the form are written, and a phone not asked for is never required', () => {
  const row = formRow({ ...NEW_FORM, name: ' Site ', ask_phone: false, require_phone: true, assignee_id: '', id: 'x', token: 'y', owner_id: 'z' });
  assert.equal(row.name, 'Site');
  assert.equal(row.require_phone, false);
  assert.equal(row.assignee_id, null);
  assert.deepEqual(Object.keys(row).filter((k) => ['id', 'token', 'owner_id', 'created_at'].includes(k)), []);
});

test('a database that is not updated yet is recognised, other errors are not', () => {
  for (const e of [{ code: '42P01' }, { code: 'PGRST205' }, { code: '42703' }, { message: 'Could not find the table public.lead_forms in the schema cache' }]) assert.ok(isNotInstalled(e), JSON.stringify(e));
  for (const e of [null, { code: '42501', message: 'permission denied' }, { message: 'Failed to fetch' }]) assert.ok(!isNotInstalled(e), JSON.stringify(e));
});

test('the public page carries the public key only, and builds everything from text', () => {
  const page = readFileSync(new URL('../../ventures/raptor/form.html', import.meta.url), 'utf8');
  assert.ok(!page.includes('__ANON_KEY__'));
  const key = page.match(/KEY = '([^']+)'/)[1];
  assert.equal(JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role, 'anon');
  assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(page));
  assert.match(page, /credentials: 'omit'/);
});

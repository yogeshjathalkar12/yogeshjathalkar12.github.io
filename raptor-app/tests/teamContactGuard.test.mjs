// Run with:  node --test tests/teamContactGuard.test.mjs      (from raptor-app/)
// src/lib/teamContactGuard.ts with a small fake Supabase: no network. The TypeScript file is transpiled on the fly with the project's own compiler.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(new URL('../src/lib/teamContactGuard.ts', import.meta.url), 'utf8');
const out = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-'));
fs.writeFileSync(path.join(tmp, 'guard.mjs'), out);
const { describeOverlap, checkTeamOverlap, noteTeamContact, reachedOut, CONTACT_WINDOW_DAYS } = await import(pathToFileURL(path.join(tmp, 'guard.mjs')).href);

const NOW = Date.parse('2026-10-25T12:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 24 * 3600 * 1000).toISOString();
const ME = 'me-1';

test('nothing to warn about for an empty or untouched company', () => {
  assert.equal(describeOverlap(null, ME, 'Acme', NOW), null);
  assert.equal(describeOverlap({}, ME, 'Acme', NOW), null);
  assert.equal(describeOverlap({ owner: null, contacted: [] }, ME, 'Acme', NOW), null);
});

test('my own contact and my own ownership never warn me', () => {
  assert.equal(describeOverlap({ owner: { user_id: ME, email: 'me@x.com' }, contacted: [{ by: ME, channel: 'sms', at: daysAgo(1) }] }, ME, 'Acme', NOW), null);
});

test('a teammate who contacted it in the last 30 days is named with the channel and the date', () => {
  const msg = describeOverlap({ contacted: [{ by: 'ben-2', channel: 'whatsapp', at: daysAgo(3) }] }, ME, 'Acme', NOW);
  assert.match(msg, /A teammate already contacted Acme by whatsapp on 2026-10-22/);
  assert.match(msg, /Contact them anyway\?$/);
});

test('the 30-day window is the same as the desktop app\'s, and an older contact does not warn', () => {
  assert.equal(CONTACT_WINDOW_DAYS, 30);
  assert.equal(describeOverlap({ contacted: [{ by: 'ben-2', channel: 'email', at: daysAgo(29) }] }, ME, 'Acme', NOW) === null, false);
  assert.equal(describeOverlap({ contacted: [{ by: 'ben-2', channel: 'email', at: daysAgo(31) }] }, ME, 'Acme', NOW), null);
});

test('the most recent of several contacts is the one named', () => {
  const msg = describeOverlap({ contacted: [{ by: 'a', channel: 'email', at: daysAgo(20) }, { by: 'b', channel: 'sms', at: daysAgo(2) }, { by: 'c', channel: 'call', at: daysAgo(9) }] }, ME, 'Acme', NOW);
  assert.match(msg, /by sms on 2026-10-23/);
});

test('someone else owning the company warns, with their email', () => {
  const msg = describeOverlap({ owner: { user_id: 'ben-2', email: 'ben@acme.com' } }, ME, 'Acme', NOW);
  assert.match(msg, /Acme is owned by ben@acme\.com\./);
  assert.match(describeOverlap({ owner: { user_id: 'ben-2' } }, ME, 'Acme', NOW), /owned by a teammate/);
});

test('an owner and a recent contact are both said', () => {
  const msg = describeOverlap({ owner: { user_id: 'ben-2', email: 'ben@acme.com' }, contacted: [{ by: 'ben-2', channel: 'email', at: daysAgo(1) }] }, ME, 'Acme', NOW);
  assert.match(msg, /owned by ben@acme\.com/);
  assert.match(msg, /already contacted Acme by email/);
});

test('broken entries are ignored, not trusted', () => {
  assert.equal(describeOverlap({ contacted: [null, {}, { by: 'ben-2' }, { by: 'ben-2', at: 'not a date' }] }, ME, 'Acme', NOW), null);
});

// ───────────── asking the database ─────────────

function fakeClient({ rows = [], error = null, throwOn = null, noteError = false } = {}) {
  const calls = { selects: [], rpcs: [] };
  const chain = (cols) => ({
    ilike(col, value) { calls.selects.push({ cols, col, value }); return this; },
    limit() { return Promise.resolve(throwOn === 'select' ? Promise.reject(new Error('boom')) : { data: rows, error }); },
  });
  return {
    calls,
    from: (table) => { assert.equal(table, 'prospect_dossiers'); return { select: chain }; },
    rpc: async (fn, args) => { calls.rpcs.push({ fn, args }); if (noteError) throw new Error('offline'); return { data: null, error: null }; },
  };
}

test('it finds the company by name and reports a teammate\'s contact', async () => {
  const c = fakeClient({ rows: [{ entity_name: 'Acme', team: { contacted: [{ by: 'ben-2', channel: 'sms', at: daysAgo(2) }] } }] });
  const why = await checkTeamOverlap(c, ' Acme ', ME, NOW);
  assert.equal(why.entity, 'Acme');
  assert.match(why.message, /by sms/);
  assert.equal(c.calls.selects[0].col, 'entity_name');
  assert.equal(c.calls.selects[0].value, 'Acme');
});

test('wildcard characters in a company name are matched literally', async () => {
  const c = fakeClient({ rows: [] });
  await checkTeamOverlap(c, '100%_Safe', ME, NOW);
  assert.equal(c.calls.selects[0].value, '100\\%\\_Safe');
});

test('whatever cannot be checked is silently "nothing to ask": no company, no user, an error, a thrown error, no rows', async () => {
  assert.equal(await checkTeamOverlap(fakeClient(), '', ME, NOW), null);
  assert.equal(await checkTeamOverlap(fakeClient(), null, ME, NOW), null);
  assert.equal(await checkTeamOverlap(fakeClient(), 'Acme', null, NOW), null);
  assert.equal(await checkTeamOverlap(fakeClient({ error: { message: 'relation does not exist' } }), 'Acme', ME, NOW), null);
  assert.equal(await checkTeamOverlap(fakeClient({ throwOn: 'select' }), 'Acme', ME, NOW), null);
  assert.equal(await checkTeamOverlap(fakeClient({ rows: [] }), 'Acme', ME, NOW), null);
});

test('a status that means a message was queued counts as reaching out; the others do not', () => {
  for (const ok of ['pending', 'queued', 'sent', 'sending', 'accepted']) assert.equal(reachedOut(ok), true, ok);
  for (const no of ['skipped', 'off', 'already', 'no_contact', 'not_found', 'failed', '', undefined, null, 5]) assert.equal(reachedOut(no), false, String(no));
});

test('noting a contact tells the book through the database function, with the book\'s own spelling of the name', async () => {
  const c = fakeClient({ rows: [{ entity_name: 'ACME Ltd' }] });
  await noteTeamContact(c, 'acme ltd', 'whatsapp');
  assert.deepEqual(c.calls.rpcs, [{ fn: 'note_prospect_contact', args: { p_entity: 'ACME Ltd', p_channel: 'whatsapp' } }]);
});

test('noting does nothing for an unknown company, and never throws', async () => {
  const none = fakeClient({ rows: [] });
  await noteTeamContact(none, 'Nobody Inc', 'sms');
  assert.equal(none.calls.rpcs.length, 0);
  await noteTeamContact(fakeClient({ rows: [{ entity_name: 'Acme' }], noteError: true }), 'Acme', 'email');
  await noteTeamContact(fakeClient({ throwOn: 'select' }), 'Acme', 'email');
  await noteTeamContact(fakeClient(), '', 'sms');
});

// Run with:  node --test tests/crm_bulk.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { bulkMessage, bulkUpdate, moveToBin } from '../src/lib/bulk.ts';

const ids = (n) => Array.from({ length: n }, (_, i) => `id${i}`);

/** Changes only ids the "person" may touch (even numbers), like the database's own rules. */
function fakeDb({ failOnPart = -1, rpcError = null } = {}) {
  const parts = [];
  return {
    parts,
    from: () => ({ update: (patch) => ({ in: (_c, part) => ({ select: async () => {
      parts.push({ patch, n: part.length });
      if (parts.length - 1 === failOnPart) return { data: null, error: { message: 'boom' } };
      return { data: part.filter((id) => Number(id.slice(2)) % 2 === 0).map((id) => ({ id })), error: null };
    } }) }) }),
    rpc: async (name, args) => { parts.push({ name, n: args.p_ids.length }); return rpcError ? { data: null, error: rpcError } : { data: args.p_ids.length, error: null }; },
  };
}

test('many records are changed in parts and only real changes are counted', async () => {
  const db = fakeDb();
  assert.deepEqual(await bulkUpdate(db, 'contacts', ids(400), { status: 'hot' }), { changed: 200, asked: 400 });
  assert.deepEqual(db.parts.map((p) => p.n), [150, 150, 100]);
  await assert.rejects(() => bulkUpdate(fakeDb({ failOnPart: 1 }), 'contacts', ids(400), {}), /boom \(75 were changed before this\)/);
});

test('delete goes to the bin, says so when there is no bin, and reports other errors', async () => {
  assert.deepEqual(await moveToBin(fakeDb(), 'deals', ids(3)), { changed: 3, asked: 3 });
  assert.equal(await moveToBin(fakeDb({ rpcError: { code: 'PGRST202', message: 'Could not find the function' } }), 'deals', ids(3)), null);
  await assert.rejects(() => moveToBin(fakeDb({ rpcError: { code: 'P0001', message: 'You do not have permission to delete records.' } }), 'deals', ids(1)), /permission/);
});

test('the message says how many, in the right words', () => {
  assert.equal(bulkMessage({ changed: 1, asked: 1 }, 'contact', 'changed'), '1 contact changed.');
  assert.equal(bulkMessage({ changed: 3, asked: 3 }, 'company', 'moved to the recycle bin'), '3 companies moved to the recycle bin.');
  assert.match(bulkMessage({ changed: 2, asked: 3 }, 'deal', 'changed'), /^2 of 3 deals changed\. You do not have access/);
});

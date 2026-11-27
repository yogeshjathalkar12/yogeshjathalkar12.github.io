// Run with:  node --test tests/crm_api.test.mjs      (from raptor-app/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { API_FIELDS, apiBase, apiExamples } from '../src/lib/apiKeys.ts';

test('the address and the examples', () => {
  assert.equal(apiBase('https://x.example/'), 'https://x.example/api/raptor/v1');
  for (const x of apiExamples('https://x.example')) {
    assert.ok(x.code.includes('https://x.example/api/raptor/v1/') && x.code.includes('YOUR_KEY'));
  }
  assert.deepEqual(API_FIELDS.map(([kind]) => kind), ['contacts', 'companies', 'deals', 'tasks', 'notes']);
});

// node --test tests/cloud_sync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarChecked, cloudReturn, showCloudPanel, withoutCloudParams } from '../src/lib/cloudSync.ts';

test('the answer from the provider is read from the address and then removed from it', () => {
  const params = new URLSearchParams('cloud_provider=google&cloud_code=c&cloud_state=s&tab=1');
  assert.deepEqual(cloudReturn(params), { provider: 'google', code: 'c', state: 's', failed: false });
  assert.equal(withoutCloudParams(params).toString(), 'tab=1');
  assert.equal(cloudReturn(new URLSearchParams('tab=1')), null);
  assert.equal(cloudReturn(new URLSearchParams('cloud_provider=google&cloud_error=1')).failed, true);
  assert.equal(cloudReturn(new URLSearchParams('cloud_provider=google&cloud_code=c')).failed, true);
});

test('a closed server with nothing connected shows nothing; an old connection can still be removed', () => {
  assert.equal(showCloudPanel(null), false);
  assert.equal(showCloudPanel({ open: false, providers: [], accounts: [] }), false);
  assert.equal(showCloudPanel({ open: true, providers: ['google'], accounts: [] }), true);
  assert.equal(showCloudPanel({ open: false, providers: [], accounts: [{ provider: 'google' }] }), true);
});

test('the booking screen only says the calendar is checked when it really is', () => {
  const account = { provider: 'google', calendar_on: true, last_error: null };
  assert.equal(calendarChecked({ open: true, providers: [], accounts: [account] }), true);
  assert.equal(calendarChecked({ open: false, providers: [], accounts: [account] }), false);
  assert.equal(calendarChecked({ open: true, providers: [], accounts: [{ ...account, last_error: 'x' }] }), false);
  assert.equal(calendarChecked({ open: true, providers: [], accounts: [{ ...account, calendar_on: false }] }), false);
});

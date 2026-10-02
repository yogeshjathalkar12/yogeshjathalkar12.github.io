import { test, expect } from '@playwright/test';

// Direct HTTP checks against both Render-hosted backends - independent of
// the UI, so a dead/sleeping/crashed backend is caught even if nothing
// about the frontend changed. Render free/starter services spin down
// after ~15min idle; the first request can be slow to wake them (not just
// to respond), hence the generous timeout rather than treating slow-but-
// alive as a failure.
const WAKE_TIMEOUT = 30_000;

test('websites-api backend responds', async ({ request }) => {
  const res = await request.get('https://websites-api-5wmu.onrender.com/', { timeout: WAKE_TIMEOUT });
  expect(res.ok(), `websites-api returned ${res.status()}`).toBeTruthy();
});

test('license server responds', async ({ request }) => {
  const res = await request.get('https://raptor-license-server.onrender.com/', { timeout: WAKE_TIMEOUT });
  expect(res.ok(), `license server returned ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBeTruthy();
});

// Every feature the app depends on must exist on the live server and be
// protected. A signed-out request should be REFUSED (401/403/422) - never
// "not found" (the route was never deployed or got dropped in a bad merge)
// and never a 5xx (the router crashed on import). This is what catches a
// whole tool or the team API silently disappearing after a deploy.
const PROTECTED_ROUTES: [string, string][] = [
  ['POST', '/api/raptor/team/otp/send'],
  ['POST', '/api/raptor/team/invite'],
  ['POST', '/api/raptor/team/reinstate'],
  ['POST', '/api/raptor/team/transfer-ownership'],
  ['POST', '/api/raptor/team/reset-mfa'],
  ['POST', '/api/billing/create-order'],
  ['POST', '/api/raptor/diagnostic/bulk-check'],
  ['POST', '/api/raptor/threader/scan-threads'],
  ['POST', '/api/raptor/spintax/compile'],
  ['POST', '/api/raptor/resolver/ranges/upload'],
  ['POST', '/api/raptor/chronos/resolve'],
  ['POST', '/api/raptor/vad/log-result'],
  ['POST', '/api/raptor/kmeans/cluster'],
  ['POST', '/api/raptor/video/log-result'],
  ['POST', '/api/raptor/montecarlo/simulate'],
];

for (const [method, path] of PROTECTED_ROUTES) {
  test(`${method} ${path} is deployed and protected`, async ({ request }) => {
    const res = await request.fetch(`https://websites-api-5wmu.onrender.com${path}`, { method, data: {}, timeout: WAKE_TIMEOUT });
    expect([401, 403, 422], `${path} returned ${res.status()} (404 = not deployed, 5xx = crashed)`).toContain(res.status());
  });
}

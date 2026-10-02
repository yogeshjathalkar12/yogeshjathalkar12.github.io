import { test, expect } from '@playwright/test';

// THE CHECK THAT WOULD HAVE CAUGHT THE 2026-10-01 INCIDENT: a
// redirectTo/#-route collision silently broke every Google AND
// email-confirmation login for weeks because nothing ever actually
// drove a real sign-in and confirmed the dashboard rendered. This does.
//
// Google itself isn't exercised here (its consent screen can't be
// automated reliably, and shouldn't be - that's Google's surface, not
// ours). Email+password login shares the exact same post-redirect code
// path (AuthContext.tsx -> RequireAuth.tsx) that Google OAuth does, so a
// break in that shared path - the actual kind of bug that just
// happened - is still caught here.
//
// Requires HEALTHCHECK_EMAIL / HEALTHCHECK_PASSWORD env vars, set as
// GitHub Actions secrets (see .github/workflows/daily-health-check.yml)
// - a dedicated test account, never a real user's credentials.
const EMAIL = process.env.HEALTHCHECK_EMAIL;
const PASSWORD = process.env.HEALTHCHECK_PASSWORD;

test('can log in with email+password and reach the dashboard', async ({ page }) => {
  test.skip(!EMAIL || !PASSWORD, 'HEALTHCHECK_EMAIL / HEALTHCHECK_PASSWORD not set');

  await page.goto('/ventures/raptor/?auth=login');

  await page.fill('#loginEmail', EMAIL!);
  await page.fill('#loginPassword', PASSWORD!);
  await page.click('#loginSubmitBtn');

  // Real success is landing on the React app's dashboard with the
  // signed-in user's name rendered - not just "the URL changed," which
  // is exactly what silently failed before: the URL update happened,
  // but no session, so RequireAuth bounced straight back to login.
  await page.waitForURL(/\/ventures\/raptor\/app\/#/, { timeout: 15_000 });
  await expect(page.locator('h1.arsenal-hero-title')).toContainText('Workspace. Welcome,', { timeout: 15_000 });

  // The definitive failure signature from the incident: silently
  // ending up back on the login page instead of the dashboard.
  expect(page.url()).not.toContain('?auth=login');
});

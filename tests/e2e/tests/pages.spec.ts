import { test, expect } from '@playwright/test';

test('landing page loads with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const res = await page.goto('/ventures/raptor/');
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator('.nav-logo')).toBeVisible();

  expect(errors, `console errors on landing page:\n${errors.join('\n')}`).toEqual([]);
});

test('Windows download button points at a real, reachable file', async ({ page, request }) => {
  await page.goto('/ventures/raptor/');
  const href = await page.locator('a:has-text("Download Raptor for windows")').first().getAttribute('href');
  expect(href, 'download button has no href').toBeTruthy();

  // HEAD, not GET - this is a multi-hundred-MB installer; confirming the
  // URL resolves and the file exists is the point, not downloading it.
  const res = await request.head(href!, { maxRedirects: 5 });
  expect(res.ok(), `download link ${href} returned ${res.status()}`).toBeTruthy();
});

test('an unauthenticated visit to the app is sent to the real login, not a dead end', async ({ page }) => {
  await page.goto('/ventures/raptor/app/#/dashboard');
  await page.waitForURL(/\?auth=login/, { timeout: 10_000 });
});

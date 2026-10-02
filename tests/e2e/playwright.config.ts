import { defineConfig } from '@playwright/test';

// This suite tests the LIVE, deployed site (shoonyaorigins.com) - there is
// no local server to start. It exists to catch the class of bug that broke
// Google/email login silently for weeks (see the 2026-10-01 incident): a
// redirect or a page that LOOKS fine on push but is actually broken for
// real users, which nothing in the build/deploy pipeline would ever catch
// on its own.
export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  retries: 1, // one retry absorbs a flaky network blip without hiding a real break (still fails after 2 misses)
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'https://shoonyaorigins.com',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});

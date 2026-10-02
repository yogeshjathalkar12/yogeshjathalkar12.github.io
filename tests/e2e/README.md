# Daily health check

Synthetic checks against the **live, deployed** site and its backends -
not unit tests, not build tests. Runs once a day on its own schedule (see
`.github/workflows/daily-health-check.yml`), plus on-demand from the
Actions tab ("Run workflow").

## Why this exists

On 2026-10-01, Google and email-confirmation login silently broke for
everyone for weeks. The cause: `redirectTo` pointed at
`.../app/#/dashboard`, colliding with Supabase's own
`#access_token=...` URL fragment (a URL only has one `#`) - the session
never got established, and every login bounced back to the login page.
Nothing in the deploy pipeline caught it, because nothing ever actually
drove a real sign-in and checked that the dashboard rendered - the build
succeeded, the link checker passed, the site "deployed" fine. It was only
found because a real user kept hitting it and reported it.

This suite exists so that specific kind of bug - everything LOOKS fine,
but a real user's actual path through the app is broken - gets caught
automatically, the morning it happens, instead of from a frustrated user
report.

## What it checks

- `tests/login.spec.ts` - signs in with a real test account and confirms
  the dashboard actually renders. This is the check that would have
  caught the incident above.
- `tests/backend-health.spec.ts` - direct HTTP checks against
  `websites-api` and the license server, independent of the frontend.
- `tests/pages.spec.ts` - the landing page loads with no console errors,
  the Windows download link actually resolves to a real file, and an
  unauthenticated visit to the app is still correctly gated to login.

## One-time setup

1. Create a **dedicated test account** - its own email and password, never
   a real user's credentials. Sign up normally through
   `shoonyaorigins.com/ventures/raptor/`.
2. In this repo: **Settings → Secrets and variables → Actions → New
   repository secret**, add:
   - `HEALTHCHECK_EMAIL`
   - `HEALTHCHECK_PASSWORD`

Without these two secrets, `login.spec.ts` skips itself (visibly, in the
run's output) rather than failing - the other checks still run.

## When it fails

A failed scheduled run emails the repo owner automatically (standard
GitHub Actions behavior - no extra notification setup needed). Open the
failed run in the **Actions** tab; the `playwright-report` artifact has
screenshots and a trace for whatever broke.

## Running it locally

```bash
cd tests/e2e
npm install
npx playwright install chromium
HEALTHCHECK_EMAIL=... HEALTHCHECK_PASSWORD=... npm test
```

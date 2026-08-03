# Raptor App — Setup & Deploy

This is the React rebuild of the **logged-in app only** (dashboard, Arsenal
tools, CRM). Your public marketing site (`index.html`, `styles.css`,
`script.js`, the auth modal, pricing page) is **not part of this** and
does not need to change — it keeps working exactly as it does today.

## The one thing that connects them

Your marketing site's auth modal (`script.js`) redirects to the dashboard
after login/signup in 4 places, all using the string:

```
/ventures/raptor/dashboard.html
```

Find-and-replace all 4 with:

```
/ventures/raptor/app/#/dashboard
```

That's the entire integration. Nothing else in your marketing site changes.

## Where this app lives in your repo

```
your-repo/
  index.html                 ← unchanged marketing site
  styles.css                 ← unchanged
  script.js                  ← 4 URLs changed (above)
  ventures/
    raptor/
      dashboard.html         ← DELETE once you've cut over (replaced by app/)
      utility/*.html         ← DELETE once you've cut over (replaced by app/)
      app/                   ← NEW — this is where the BUILT app goes
                                 (you never hand-write files here — a
                                 GitHub Action generates this folder)
  raptor-app/                ← NEW — this is the SOURCE CODE (what's in this zip)
    src/
    package.json
    ...
  .github/
    workflows/
      deploy-raptor-app.yml  ← NEW — the automation (also in this zip,
                                 under raptor-app-workflow/, move it to
                                 this exact path)
```

## First-time setup (do this once)

1. Unzip `raptor-app/` into the root of your GitHub repo, next to
   `index.html`.
2. Move `raptor-app-workflow/deploy-raptor-app.yml` to
   `.github/workflows/deploy-raptor-app.yml` in your repo.
3. Locally, sanity-check it builds before you push anything:
   ```
   cd raptor-app
   npm install
   npm run build
   ```
   If this succeeds locally, it will succeed in GitHub Actions too.
4. Commit and push both `raptor-app/` and `.github/workflows/`.

## What happens after that

Every time you push a change **inside `raptor-app/`**, GitHub Actions
automatically:
1. Installs dependencies
2. Runs `npm run build`
3. Copies the build output into `ventures/raptor/app/`
4. Commits that folder back to your repo

You keep doing `git push` like you always have — the build step just
happens for you instead of you running it and copying `dist/` by hand.
Nothing else in your repo (marketing site, pricing page, blog) triggers
this workflow or gets touched by it.

## Local development

```
cd raptor-app
npm install
npm run dev        # http://localhost:5173 — hot reload, talks to your
                    # real backend and Supabase project (same config
                    # as production)
```

## Cutting over safely

Don't delete `dashboard.html` or `utility/*.html` on day one. Recommended
order:
1. Deploy `ventures/raptor/app/` via the workflow above.
2. Manually visit `yoursite.com/ventures/raptor/app/#/dashboard`, log in,
   click through every tool, confirm credits/history/auth all behave
   correctly against your real backend.
3. Only once you're confident, update the 4 URLs in `script.js` to point
   there instead of `dashboard.html`.
4. Only after that's live and confirmed, delete the old
   `dashboard.html` / `utility/*.html` files.

At every step up to #3, the old static pages keep working as a fallback
— you're never in a state where login is broken.

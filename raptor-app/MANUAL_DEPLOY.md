# Manual branch-and-test deploy (no GitHub Actions yet)

Use this the first time, so you can see and click through the real
thing on GitHub Pages before wiring up any automation.

## 1. Branch — nothing live changes yet

```
cd yogeshjathalkar12.github.io      # your repo root, next to index.html
git checkout -b update-raptor-react
```

## 2. Drop this app's SOURCE code in, alongside — not instead of — anything

```
# unzip raptor-app-scaffold.zip here so you get:
#   yogeshjathalkar12.github.io/raptor-app/   <- NEW, source code only
#
# Nothing under yogeshjathalkar12.github.io/ventures/raptor/ is touched
# in this step. dashboard.html, utility/, crm/, index.html — all
# untouched, still there, still working.
```

## 3. Build it locally

```
cd raptor-app
npm install
npm run build
```

This creates `raptor-app/dist/` — the finished static files. This is
the ONLY thing that ever goes into your live site. `raptor-app/` itself
(the src/, package.json, node_modules) never gets pushed to the
`ventures/raptor/` folder — it's source, not a deliverable.

## 4. Copy ONLY the build output into a NEW subfolder

```
cd ..
mkdir -p ventures/raptor/app
cp -r raptor-app/dist/* ventures/raptor/app/
```

Check what this touched:
```
git status
```
You should see ONLY new files under `ventures/raptor/app/` — nothing
modified or deleted anywhere else. If you see anything under
`ventures/raptor/dashboard.html`, `ventures/raptor/index.html`, or
`ventures/raptor/utility/` listed as modified or deleted, STOP —
something copied wrong, don't commit.

## 5. Commit and push the BRANCH (not main)

```
git add raptor-app ventures/raptor/app
git commit -m "Add React Raptor app in ventures/raptor/app/, untouched otherwise"
git push -u origin update-raptor-react
```

## 6. See it live, without affecting your real site

GitHub Pages serves from `main` (or whatever your Pages branch is set
to), NOT from `update-raptor-react`. So this push does not go live
anywhere yet — your production site is completely unaffected. To
actually view it running on GitHub Pages before merging, you have two
options:
  a) Merge into main (see step 7) then visit
     yoursite.com/ventures/raptor/app/ — since it's a NEW folder,
     this can't collide with or break anything that already works.
  b) Or ask me to set up a second GitHub Pages environment / preview
     workflow if you want to see it live without merging at all.

## 7. Merge when you're happy

```
git checkout main
git merge update-raptor-react
git push
```

At this point `yoursite.com/ventures/raptor/app/` is live. Your
existing dashboard.html and utility/*.html are STILL there, STILL
working, STILL what real users hit — because nothing in script.js
points at the new app yet.

## 8. Only when you've personally clicked through everything at /app/

Change the login redirect (4 occurrences of
`/ventures/raptor/dashboard.html` in script.js) to
`/ventures/raptor/app/#/dashboard`. This is the one moment real users
start using the new app. Everything before this step is 100% invisible
to them.

## 9. Only after that's confirmed working live

Delete `dashboard.html` and `utility/*.html` — they're dead weight
once script.js no longer points at them.

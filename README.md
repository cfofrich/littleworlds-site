# littleworlds.io

The website for **Little Worlds: Stickers** (iPhone and iPad): one page plus "What's new" and the privacy policy. Plain static
HTML, CSS and a little JavaScript, built from the app's own vector art, so the stickers on the page are the real ones
and play their real reactions when tapped. No cookies, ads or trackers. The one outside script is Cloudflare Web Analytics (cookieless visit counts),
which the privacy policy names.

## Layout

```
public/            the site, ready to serve (committed; Cloudflare deploys this folder as is)
src/               page templates, CSS, JS, hero scenes (scenes.json), copy (site.json), _headers/_redirects
art/               art exported from the app: stickers.json, worlds.json, ui.json, audio.json (committed)
tools/
  export-art.cjs   app repo -> art/ + public/img/worlds/*.svg   (npm run art)
  assets.mjs       app repo -> fonts, favicons, link preview      (npm run assets)
  build.mjs        src/ + art/ -> public/                         (npm run build)
  serve.mjs        local preview at http://localhost:4321          (npm run serve)
  shot.swift       full-page screenshots with macOS WebKit
```

## Everyday

```bash
npm install
npm run build
npm run serve
```

Only `npm run build` is needed for copy or design changes. `npm run art` and `npm run assets` read the app repo
(`../little-worlds`, or set `APP_REPO`), so run them when the app's stickers, scenery, sounds or icon change.

## What's new (every app release)

`src/whats-new.html` (served at `/whats-new`, linked from the footer) lists the app's updates for parents: one
short entry per release with the month and year, newest first. It is one of the three places every app release
updates (the release rule in the app repo's CLAUDE.md; the other two are the in-app "What's new" card and the App
Store text). **An entry goes live only after that version is on the App Store**: write it on a branch and merge
and push when the update is out (check with the lookup command in the app repo's docs/listing.md, and check the
entry's month is still right). Say what a feature does; no health or therapy claims.

## Seasons

Like the app, the site follows the calendar, but only when it's rebuilt: in **October** the hero is the Halloween night
and Halloween is the first world ("New!" in 2026); the rest of the year the hero is the Farm and Halloween is last.
**Rebuild and push on Nov 1** (and again on Oct 1); the push deploys it. Preview another date with
`SITE_DATE=2026-11-02 npm run build`. Hero layouts live in `src/scenes.json` (sticker centers on the world's
1600 x 1000 canvas).

## Deploy (Cloudflare)

- A Cloudflare Worker named `littleworlds-site` (static assets, no code), connected to this GitHub repo: **every push
  to `main` deploys `public/`** as is. `wrangler.jsonc` says which folder, serves `404.html` for missing pages and
  attaches `littleworlds.io` and `www.littleworlds.io` (Cloudflare makes their DNS records and certificates).
  Also reachable at https://littleworlds-site.cfofrich.workers.dev.
- `public/_headers` sets a strict Content Security Policy (only the site's own files) and caching;
  `public/_redirects` sends the old privacy-policy address to `/privacy`.
- Cloudflare Web Analytics is on (Chris's call, Oct 9): cookieless, no identifying. Cloudflare adds its script
  (automatic setup), or set `webAnalyticsToken` in `src/site.json` to add it in the build. The CSP allows
  `static.cloudflareinsights.com` and `cloudflareinsights.com`. Keep Email Address Obfuscation off (it would inject
  another script).

## Rules

- Nothing from other servers except Cloudflare Web Analytics: fonts, images and sounds are all self-hosted. No cookies,
  no storage, no trackers. The privacy policy (`src/privacy.html`) says exactly this; keep it true.
- Apple's "Download on the App Store" badge (`public/img/app-store-badge.svg`, from Apple's marketing tools) is used
  unmodified, at least 40 px tall, with clear space, linking straight to the App Store.
- Accessible: real text, alt text, keyboard-playable stickers (they're buttons), reduced motion respected.

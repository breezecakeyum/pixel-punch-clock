# Time Tracker

A 100% free, offline-first PWA time tracker that syncs to a Google Sheet through
a Google Apps Script Web App webhook. No backend hosting, no database, no cost.

## How it works

- `index.html` / `app.js` — mobile-first UI. Tracks one active task at a time
  (Start/Stop), showing a live elapsed timer computed from a stored start
  timestamp (so it stays accurate across app backgrounding/reloads).
- Every Start/Stop action is written to an IndexedDB queue *before* attempting
  to send it. `app.js` then tries to flush the queue immediately; if the
  device is offline or the request fails, the entry just stays queued.
- `window.addEventListener('online', ...)` plus a 20s fallback timer re-flush
  the queue automatically once the device is back online (some mobile
  browsers don't fire `online` reliably after backgrounding).
- `sw.js` caches the app shell (HTML/JS/manifest/icons) so the app itself
  loads offline. It deliberately ignores POST requests and cross-origin
  requests so it never interferes with the sync queue.
- `apps-script/Code.gs` is the webhook: it appends a row on "Start" and fills
  in End Time / Duration on the matching "Stop", creating a new sheet tab on
  demand.

## Setup

### 1. Deploy the Google Apps Script backend

1. Create (or open) the Google Sheet you want logs to land in.
2. **Extensions > Apps Script**, delete the placeholder code, paste in the
   contents of [`apps-script/Code.gs`](apps-script/Code.gs).
3. **Deploy > New deployment**, type **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the resulting `.../exec` URL.

### 2. Configure the app

Open the app, tap the gear icon, paste the Web App URL into **Webhook
settings**, and save.

This URL is never hardcoded in `app.js` or committed to the repo — it's
typed into the Settings panel at runtime and saved only to that browser's
`localStorage`, on that device. Since GitHub Pages just serves the static
files that are in the repo, the URL is never part of what gets deployed or
publicly visible; each person who opens your Pages site has to enter their
own webhook URL (or you enter it once per device you personally use). The
input is also masked like a password field, with a show/hide toggle, so it
isn't left in plain text on screen.

The one thing this does **not** protect against: the Apps Script deployment
itself is set to "Anyone" access, meaning anyone who *obtains* that URL (not
from your site's source, but by other means) could POST to it directly. If
that's a concern, you can add a shared-secret check in `Code.gs` (e.g.
require a matching `token` field in the POST body) and enter that token
alongside the URL in Settings.

### 3. Generate real icons (optional)

`icons/*.png` are placeholder generated icons. Swap them for your own artwork
at the same file names/sizes (192x192 and 512x512, plus maskable variants) if
you want custom branding.

### 4. Deploy to GitHub Pages

```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

Then in the repo's **Settings > Pages**, set the source to the `main` branch,
root folder. The app will be served at `https://<user>.github.io/<repo>/`.

Because this is a static site with relative paths (`./index.html`,
`./app.js`, etc.), it works whether it's served from a domain root or a
GitHub Pages subpath — no config changes needed either way.

## Notes / limitations

- One active task at a time, by design (matches the Start/Stop model).
- The webhook POST uses `Content-Type: text/plain` and `mode: 'no-cors'` on
  purpose. `text/plain` keeps it a CORS "simple request" so the browser skips
  an OPTIONS preflight, which Apps Script web apps don't handle. `no-cors`
  means the app never tries to read the response — Apps Script's actual
  response doesn't reliably carry `Access-Control-Allow-Origin`, so a normal
  `fetch` can report failure even though the webhook received and processed
  the request. Treating "the request didn't throw" as success avoids
  resending (and duplicating rows for) requests that actually succeeded.
  `Code.gs` parses the body as JSON regardless of the declared content type.
- Not multi-device sync — each device has its own local queue and settings.
  All devices ultimately write to the same Sheet, but there's no shared
  "currently running task" state across devices.

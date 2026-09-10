# Pixel Punch Clock

A 100% free, offline-first, 8-bit styled PWA time tracker that syncs to a
Google Sheet through a Google Apps Script Web App webhook. No backend
hosting, no database, no cost. Every tracked session also feeds a small
built-in RPG layer — XP, streaks, gear, and monster fights — meant to make
starting and finishing a session more immediately rewarding.

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
  in Stop Time / Duration on the matching "Stop", creating a new sheet tab on
  demand. Each row gets a Date column plus separate Start Time / Stop Time
  columns (clock time only) instead of one combined datetime per column.
- The **Metrics** view (nav toggle at the top) reads all tabs back via
  `GET ?action=data` on the same webhook and computes everything —
  today/week/month totals, top tasks, time per tab, a 14-day trend — in
  `app.js`. Results are cached in `localStorage` so the view still shows the
  last-loaded numbers offline, and re-fetches automatically after 30s or on
  demand via the Refresh button. Metrics reflect what's actually synced to
  the Sheet (plus a live count of anything still queued locally), not
  unsynced local entries — so numbers can lag slightly behind reality while
  offline, by design, rather than risk double-counting once those entries
  sync.

## Gamification

All of this lives in `app.js`, is driven entirely by real Start/Stop
activity, and has no separate backend — it's just more localStorage state
(`tt_rewards`, `tt_gear`) that happens to also sync through the same Sheet
(see **Progression sync**, below).

- **XP, level, streak** — every Stop grants `5 + 1 XP per minute tracked`,
  capped at 100 XP (reached at 95 minutes), so leaving a timer running
  indefinitely is never better than several honest shorter sessions. The
  streak counts consecutive calendar days with at least one Stop.
- **Skirmish, then the real fight** — while a session is actively being
  tracked, the avatar loops through translucent, reward-free "skirmish"
  clashes in the scene — visible proof that something is happening while you
  work. The moment you hit Stop, whichever clash is on screen snaps to full
  color and resolves for real: that's the one and only roll that grants XP,
  a streak update, and a chance at loot. Nothing in the skirmish loop itself
  ever calls into the reward code.
- **Normal fights vs. events** — a normal fight's monster and loot are
  weighted toward your current level tier. Separately, an event meter
  (visible once Dungeon Lv7 / Castle Lv12 is unlocked) fills one notch per
  Stop; at 5/5 the next fight becomes a themed Dungeon Raid or Castle Siege
  instead — its own monster roster, its own background, and a **guaranteed**
  drop from that environment's exclusive 4-piece gear set (until you've
  found the whole thing).
- **Gear and sets** — found items show up on the **Character** tab, where
  you pick which one to actually equip per slot (Weapon/Shield/Helmet/Cape).
  Wearing a complete matching set (e.g. all 4 Dungeon Delver pieces) adds a
  loot-chance bonus to every future fight and gives the avatar a unique
  glow, on top of the streak-length glow it already gets.
- **Idle vignettes & scenery** — reserved for when *nothing* is being
  tracked, never during an active session: every 1-3 minutes of idle
  walking, a short ambient moment plays (wandering through town, resting by
  a campfire, browsing a market, fishing) — purely cosmetic, cancelled
  instantly if a real fight needs to start. Independently, the walking
  background cycles through a handful of palettes roughly every 5-10
  minutes, crossfading instead of cutting.
- **First-run tutorial** — a short walkthrough auto-opens the first time the
  app loads on a device, then hands off into the Menu if no webhook is saved
  yet. Replayable anytime via **Menu -> Replay tutorial**.

## Progression sync

Level, streak, and gear push to and pull from a hidden `_GameState` tab in
the same Sheet the task log uses (via `saveState`/`state` actions on the
same webhook) — so opening the app on a second device with the same webhook
URL saved picks up wherever the first one left off, automatically. Pulls are
merged with whatever's already local (max XP, union of found gear,
latest-wins for streak/equipped), so a stale read can never roll a device
backwards. **Menu -> Sync progress now** triggers it on demand. For a device
that doesn't have the webhook configured yet, **Menu -> Generate save code**
produces a short text code you can paste into **Load a code** on the other
device instead — also merge-based, not destructive.

The task queue and "currently running task" are **not** part of this sync —
each device tracks its own active session independently; only completed
progression (XP/streak/gear) is shared.

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

Open the app, tap the gear icon to open the **Menu**, paste the Web App URL
into **Webhook**, and save. (First launch on a device shows a short tutorial
first, which hands off into this same Menu automatically.)

This URL is never hardcoded in `app.js` or committed to the repo — it's
typed into the Menu at runtime and saved only to that browser's
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
alongside the URL in the Menu.

### 3. Generate real icons (optional)

`icons/*.png` are placeholder generated icons (currently a small pixel-art
clock, matching the app's retro theme). Swap them for your own artwork at the
same file names/sizes (192x192 and 512x512, plus maskable variants) if you
want custom branding.

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
- The Metrics read (`GET ?action=data`) uses JSONP (a `<script src="...">`
  tag) instead of `fetch()`, for the same underlying reason: it needs to
  actually read the response, and a `<script>` load is never subject to CORS
  at all, so it works regardless of what headers Apps Script sends back.
- The task queue, the currently-running task, and the webhook URL/sound
  setting are all per-device — each browser has its own. Level/streak/gear
  progression is the one thing that *does* sync across devices, through the
  same Sheet (see **Progression sync**, above).
- Whenever `apps-script/Code.gs` changes in this repo (most recently: the
  `_GameState` tab and its `saveState`/`state` actions), re-paste the
  updated file into your Apps Script project and create a new deployment
  version (Manage deployments → Edit → New version) so the same `/exec` URL
  picks up the change. The app degrades gracefully against a backend that
  hasn't been redeployed yet — task logging keeps working either way, only
  the newer feature stays inactive until you redeploy.
- The retro/NES look uses two self-hosted fonts (`fonts/PressStart2P.woff2`,
  `fonts/VT323.woff2`) rather than a Google Fonts CDN link, to keep the app
  fully offline-capable — they're cached by `sw.js` like everything else.
  Both are open-source (SIL Open Font License) and free to use/redistribute:
  [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) and
  [VT323](https://fonts.google.com/specimen/VT323).

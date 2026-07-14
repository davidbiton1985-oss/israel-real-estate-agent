# Israel Real Estate Agent 🏠

Personal, local-first **automatic** real-estate alert agent for Israel (rent + sale).

Define your search criteria once. The watcher checks your sources **every 5 minutes**, ingests new listings automatically, parses them (Hebrew/English), dedupes reposts, scores them 0–100 against your profiles — broker vs. private with the exact evidence phrase, red flags, recommended action — and **WhatsApps you immediately** when a strong match appears (console fallback when Twilio isn't configured).

**Personal-use tool. Not a SaaS. Localhost only.**

## How it works (the automatic loop)

Two **browser userscripts**, running in your own logged-in tabs, are the primary sensors. A local server parses, dedupes, scores, and WhatsApps you.

```
Yad2 pinned search tab ──┐
  (yad2-tab-watcher)      │
Facebook #re-agent tab ──┤   /api/capture      strong match ─────► WhatsApp now
  (groups-watcher:        ├─► + IMAP poll  ──► parse→dedup→score ├─► possible/borderline ─► review digest (batched WhatsApp) + dashboard
   notifications + sweep) │   (every ~5 min)                     ├─► duplicate/repost ────► suppressed
free portal / capture ───┘                                       └─► price drop ─────────► re-alert 📉
```

The free source stack (Yad2's own email alerts are a **paid** feature, so we don't use them):

1. **Yad2 tab watcher (free, first-party)** — your Yad2 search open in a pinned tab with a userscript; re-checks every 7–10 min (randomized) *in your own browser* and posts new listings. See **"Yad2 for free"**.
2. **Facebook reader (free, first-party)** — one pinned `notifications#re-agent` tab with a userscript that reads your group notifications **and** sweeps each target group's chronological feed, so posts Facebook never notifies you about are still caught. See **"Facebook monitoring"**.
3. **Realta free Telegram alerts (free redundancy)** — [realta.co.il](https://realta.co.il/) aggregates Yad2 + Madlan + Homeless + Komo + OnMap + Facebook and pushes free, immediate, per-match Telegram alerts. Run it as an independent second channel so no single sensor failure silently costs you a listing.
4. **Free portal emails (supplementary)** — Homeless/Madlan saved-search emails into the IMAP inbox (thin for small cities; **Yad2 email is paid**, and Facebook per-post group emails have been discontinued).
5. **One-click capture** — select text on any page, click the **capture bookmarklet** (`docs/browser-helper.md`).

Strong matches hit WhatsApp within a cycle. **Possible/borderline matches are batched into a review digest** so nothing on-criteria is ever silently dropped. A **daily heartbeat + watchdogs + an external dead-man's switch** make any outage loud (see "Reliability & safety nets").

## Daily workflow

There isn't one — that's the point. Keep `npm run scheduler` running; read your WhatsApp. Open the dashboard when you want to review possible matches, tune profiles, or check source health. **Manual paste still exists** ("Manual Add" in the nav) as a fallback and parser-debug tool. It is not the main workflow — for Facebook posts you're viewing, the one-click capture bookmarklet replaces copy/paste.

## Real-world QA checklist

Use this when validating the app against **actual** Yad2/Facebook/WhatsApp listings (as opposed to the seeded demo data).

**What to paste:** 5–10 real listings, ideally a mix — some rentals, some sales, some clearly private, some clearly broker, at least one you know is a repost/duplicate of another, and at least one in English if you have one. Use **Manual Add** for each (this checklist is exactly what Manual Add exists for — validating the same pipeline the automatic watcher uses).

**After each listing, open the two `<details>` sections at the bottom of its Matches card** — "🔍 Debug: parsed fields" and "Raw listing text" — and compare parsed values against what the original post actually says:

| Check | How to judge it |
|---|---|
| **Parser accuracy** | For each field in the debug panel (price, rooms, sqm, city, neighborhood, street, floor, balcony/parking/elevator/mamad, entry date, condition, furnished), does it match what the raw text actually says? A field being `—` (unknown) is fine — it's a parser miss only if it extracted something **present but wrong**, or missed something clearly stated. |
| **Match score** | Does the 0–100 score feel right for how good a fit this listing is against your profile? Check the "Why it matched" / "Concerns" / "Missing info" lists — do the *reasons* make sense, not just the number? |
| **Broker classification** | Does `brokerStatus` + `brokerEvidence` in the debug panel match reality? If the post says "ללא תיווך" and it comes out `BROKER`, or vice versa, that's a real bug — note the **exact phrase** that should have been recognized. |
| **Duplicate suppression** | If you paste a listing you know is a repost of one already in the system: does it get flagged (`isDuplicateOf` set, or the exact-match "existing listing updated" outcome banner) instead of alerting again? If you paste two **genuinely different** listings that happen to share city/price/rooms, do they stay separate? |
| **WhatsApp / fallback alert** | If the score clears your profile's WhatsApp threshold, did an alert actually arrive (WhatsApp if Twilio is configured, otherwise check the terminal running `npm run dev` for the console fallback block)? Does the alert text match the card (broker/fee/evidence/reasons/action)? |

**Recording what you find:** open the "📝 QA notes" section on the specific listing's card and write a short note — e.g. *"price parsed wrong — should be 6,500 not 6,000"*, *"broker status wrong — text says ללא תיווך"*, *"city missed — mentions הרצליה"*, *"should not be duplicate — this is a different apartment"*. Notes are saved per-listing and never affect scoring — they're purely for you (and for handing back to Claude) to track what needs fixing. A pink "📝 has QA notes" badge appears on any card with a note, so flagged listings are easy to find again later.

**What to send back if something's wrong:** the raw listing text (paste it, don't paraphrase), what field(s) were wrong and what they should have been, and — for broker/duplicate issues — the exact phrase you'd expect the parser to key off. The QA notes field is the easiest way to keep this organized as you go.

## Legal / safety stance

- **The app does not perform unsafe scraping or bypass platform restrictions.** No CAPTCHA solving, no login-wall bypass, no rate-limit evasion, no stealth/fingerprint tricks, and nothing that risks your accounts.
- **Automatic ingestion runs through safe, user-authorized paths**: the primary sensors are userscripts reading **your own logged-in browser session** (doing what you'd do by hand — re-checking your own Yad2 search and your own Facebook notifications), plus free portal saved-search **email alerts** the portals push to *your* inbox. The app only reads what you already legitimately see; listing pages themselves are not crawled server-side.
- When a source shows a verification/checkpoint page, the userscripts **back off and wait for you to solve it by hand** — they never bypass it.
- The Yad2 listing ID is extracted from each link for exact duplicate detection.
- Listing URLs are stored as references; listing pages themselves are not crawled.

## Setup

Requirements: Node 20+.

```bash
cp .env.example .env          # fill in IMAP (automatic ingestion) + Twilio (WhatsApp)
npm install
npx prisma migrate dev        # creates SQLite db + runs seed (demo profiles + listings)
npm run dev                   # open http://localhost:3000 (dashboard)
npm run scheduler             # separate terminal: the 5-minute automatic watcher
```

If the seed didn't run: `npm run db:seed`.

## Automatic ingestion setup (email alerts via IMAP) — ~5 minutes

This is the main workflow. The portals' own saved-search alert emails become your automatic listing feed.

1. **Pick an inbox.** A dedicated Gmail address is easiest (keeps listing alerts separate), but any IMAP-capable mailbox works.
2. **Gmail users: create an App Password.** Google Account → Security → 2-Step Verification → **App passwords** → create one for "Mail". Use it as `IMAP_PASS` — never your real password.
3. **Fill `.env`:**
   ```
   IMAP_HOST="imap.gmail.com"
   IMAP_PORT="993"
   IMAP_USER="your.alerts.inbox@gmail.com"
   IMAP_PASS="<the app password>"
   IMAP_FOLDER="INBOX"
   EMAIL_ALLOWED_SENDERS="homeless,madlan"  # comma-separated From-header filters; empty = ingest all unseen mail
   ```
4. **Point free alert emails at that inbox:** free portal saved-search alerts — **Homeless** (homeless.co.il) and **Madlan** (madlan.co.il); add their sender domains to `EMAIL_ALLOWED_SENDERS`. Note the honest limits: *Yad2's own email alerts are **paid*** (use the free tab watcher + Realta instead), *Facebook per-post group emails have been **discontinued*** (use the reader userscript instead), and Homeless alerts tend to be a **daily digest** with several listings per email whose inventory is thin for small cities — so email is a supplementary source here, not the spine. Senders not matching `EMAIL_ALLOWED_SENDERS` are left unread for you.
5. **Validate:** `npm run ingest:email` runs one poll and prints what it found. Then leave `npm run scheduler` running — the dashboard's **🤖 Automatic ingestion** panel shows last check, last success, items found, and errors.

**How the mailbox is used:** the app reads **unseen** messages in the configured folder, ingests the ones from allowed senders, and marks them read. It never sends mail, never deletes anything, and the fingerprint dedup means a re-read email can't double-alert.

## Yad2 for free (the tab watcher)

Yad2 charges for saved-search email alerts, and server-side scraping is off the table (their anti-bot protection would break it within days, and it's against their terms). The free path that actually works is the **tab watcher**: your own browser, on your own Yad2 search page, doing what you would do by hand — re-checking the results every few minutes — with a small userscript that sends anything new to the app.

**Setup (~5 minutes, once):**

1. Install the **Tampermonkey** browser extension (Chrome/Firefox/Safari — free, the standard userscript manager).
2. Tampermonkey → **Create a new script** → delete the template → paste the entire contents of **`docs/yad2-tab-watcher.user.js`** → save (⌘S).
3. On Yad2, build your search (e.g. rent, Ganei Tikva + Kiryat Ono, 4–5 rooms, up to your budget) and leave that results page open in a **pinned tab**.
4. You'll see a small **"RE-Agent: …"** badge at the bottom-right of the Yad2 page — that's the watcher running. It re-checks every ~5 minutes and posts new listings to the app (which must be running: `npm run dev`).

**What it does:** finds the listing cards on the page, remembers which listing IDs it has already seen, and POSTs only new ones to `/api/capture` — where they get parsed, deduped (by Yad2 listing ID), scored, and WhatsApp'd if strong. The **first run sends everything currently listed** (that's good — it seeds the system and alerts you to existing matches); after that, only new listings.

**The honest fine print:**
- It works **only while your browser is open** with that tab alive (your Mac is awake anyway for the watcher).
- It's your real browser and your real session — **no CAPTCHA bypass, no fake fingerprints, no login automation**. If Yad2 ever shows a verification page, you solve it by hand like a normal person; the badge will say "no listings visible" until you do.
- Auto-refreshing a page may conflict with Yad2's terms on automated access. It's the same behavior as you pressing ⌘R every 5 minutes, at human-plausible frequency with randomized timing, in your own logged-in browser — but you should know it's a gray zone and it's your call to run it. Disabling it takes one click in Tampermonkey.
- One search URL per tab. Want rent in two areas covered? Either one search covering both cities (recommended — Yad2 supports multi-city search), or two pinned tabs. **Sort the search newest-first (מיון: לפי תאריך)** so the newest listings are always on page 1 — the watcher reads page 1 only.
- **Auto-updates:** the script carries `@updateURL`/`@downloadURL` pointing at this repo, so once installed, Tampermonkey pulls new versions automatically — no re-paste.

## Facebook monitoring

Facebook has **no complete, legitimate feed** — the Groups API was removed in 2024, there's no RSS, and per-post group notification emails have been discontinued (only membership/digest mail still arrives). The realistic free path is reading **your own logged-in session** with a userscript, in one pinned tab.

### Path A — automatic reader (`facebook-groups-watcher.user.js`)

Install it in Tampermonkey (same steps as the Yad2 script) and open **one** pinned tab at `https://www.facebook.com/notifications#re-agent` — the `#re-agent` marks that tab as the reader. Every 7–12 min (randomized, slower overnight) it:

- reads your **group notifications** and opens each new post's permalink to capture the full text, **and**
- **sweeps** one target group's chronological feed per cycle (round-robin), scrolling until it re-sees an already-captured post — so posts Facebook never notified you about (video/reel posts especially) are still caught.

Captured posts run the normal parse → dedup → score → WhatsApp/digest pipeline with group/author metadata. Setup: for each apartment group, set **Notifications → All posts** (helps the notification path; the sweep is the safety net for what it still misses). The reader designation survives browser restarts (a localStorage lease — no more silent multi-hour blind spots), a companion **watchdog** WhatsApps you if the reader goes silent 45+ min, and the script **auto-updates** via Tampermonkey (`@updateURL` → this repo, so no manual reinstall).

### Path B — one-click capture (any surface, while you browse)

For everything Facebook doesn't email you about — **a stranger's public post, a profile, a broker page you don't follow, a shared post, marketplace** — select the post text and click the **capture bookmarklet** (`docs/browser-helper.md`): it POSTs the selection + URL to the app's local `/api/capture` endpoint, which parses, dedupes, scores, and **WhatsApps you within seconds** if it's strong. The surface type is detected from the URL. No copy/paste, no app tab needed.

### What Facebook coverage looks like honestly

| Surface | Coverage |
|---|---|
| Groups you joined | ✅ Automatic (the reader userscript: notifications + chronological sweep, per-group "All posts") |
| Pages you follow | ✅ Automatic where the reader sees notifications; otherwise one-click capture |
| Public posts / profiles / broker pages / shares / marketplace | ✅ One click while browsing (capture bookmarklet) |
| Posts by strangers you never see and never get notified about | ❌ Not possible safely — Facebook offers no public search API, and logged-in crawling risks your account and breaks in days. Mitigation: join the groups where such posts appear (→ automatic), and capture anything you encounter (→ one click). |

Facebook alerts include the source type, group/page name, author, and post link. Reposts/reshares of the same apartment are caught by the existing exact + fuzzy dedup and won't spam you; price drops and material changes re-alert per your profile settings. The dashboard's **📘 Facebook monitoring** panel shows configuration state, last check, and ingestion counts.

## Reliability & safety nets

The honest target isn't "miss zero" (impossible without paid feeds or anti-bot evasion — see "Legal / safety stance") but **miss near-zero, make every gap loud, and never silently drop an on-criteria listing.** The layers, all runnable as `launchd` units (see `ops/`):

- **Review digest** (`scripts/review-digest.ts`, `com.david.review-digest`) — the fix for the biggest leak. A listing can pass every hard filter yet be clamped below the WhatsApp threshold (unknown broker, an unmentioned required amenity, too many missing fields → capped at 79 < 80). Those used to vanish silently. Now every on-criteria `possible_match` is **batched into one "review" WhatsApp** a few times a day (deduped, so each listing is surfaced once). Preview safely with `npx tsx scripts/review-digest.ts --dry-run`.
- **Re-score on criteria change** (`scripts/rescore.ts`) — editing a profile now re-evaluates **every already-captured listing** against the new criteria (it used to leave them frozen at their old verdict). It sends no instant alerts; newly-qualifying items flow through the review digest, so a criteria change can't trigger a WhatsApp burst.
- **Daily heartbeat** (`scripts/daily-heartbeat.ts`, `com.david.daily-heartbeat`) — one "I'm alive + last-24h counts" WhatsApp each morning. **Its silence is the alarm** — the only thing that catches a totally dead Mac/server (which the stale-sensor watchdogs can't report, because they'd be dead too).
- **Per-sensor watchdogs** (`ops/yad2-watchdog.ts`, `ops/fb-watchdog.ts`) — WhatsApp a nudge if the Yad2 tab or the Facebook reader delivers nothing for 45+ min during waking hours (deduped 6h).
- **External dead-man's switch** — the scheduler pings `HEALTHCHECK_URL` (e.g. a free [healthchecks.io](https://healthchecks.io) check) every clean tick; the external service alerts you over an independent channel if the pings stop. No-op until you set the env var.
- **Redundancy** — because any single sensor can be CAPTCHA-blocked or closed, run **Realta free Telegram alerts** as an independent second channel (see the source stack above).
- **Self-healing** — when the Facebook reader goes 45+ min stale during waking hours, `fb-watchdog` first **auto-reopens the reader tab** (`open -a "Google Chrome" …notifications#re-agent` — the hash reclaims the lease) and only WhatsApps you if that didn't bring it back next cycle (i.e. a real CAPTCHA). So a Mac-woke / tab-dropped outage recovers unattended.

### Keeping the sensors alive (browser substrate — zero code, do once)
The sensors run in Chrome tabs, so Chrome/macOS settings matter as much as the code:
- **Chrome Memory Saver** discards inactive tabs (a prime cause of silent stalls). Settings → Performance → add `facebook.com` and `yad2.co.il` to **"Always keep these sites active."**
- **Session restore**: Chrome → "Continue where you left off," and keep both tabs **pinned** so they reopen on launch.
- **Sleep**: keep the Mac awake (Energy settings / `caffeinate` / Amphetamine) so launchd, the watchers, and the watchdogs keep running. (A Mac that's *off* is fine — the missing daily heartbeat is the correct "system down" signal — but a Mac *asleep* looks alive while capturing nothing.)
- **Tampermonkey**: enable "Check for updates" so `@version` bumps propagate without a manual paste.
- Confirm all jobs are loaded: `launchctl list | grep david`.

## Using it

1. **Dashboard** (`/`) — profiles overview, **Run scan now** (processes pending/demo listings), **Send test alert**.
2. **New Profile** — rent/sale, cities, price/rooms/size, features (balcony/parking/elevator/mamad as Required/Preferred/Indifferent), **broker filter** (הכל / רק ללא תיווך / רק בתיווך / עדיף ללא תיווך… / לא משנה), broker-fee preference, WhatsApp threshold (default 80) and dashboard threshold (default 60).
3. **Manual Add (fallback/debug)** — for listings with no automatic/capture path (e.g. a broker WhatsApp message) or for testing the parser: choose source, paste text and/or URL → same pipeline as automatic ingestion (parsed, scored, alerted if strong). For Facebook posts, prefer the one-click capture bookmarklet. Pasting a URL alone just saves it (with a nudge to add text). Re-pasting an existing listing (same Yad2 URL/ID, source URL, or matching content) **updates it in place** instead of creating a duplicate row — see "Duplicate suppression & price-drop re-alerts" below.
4. **Matches** — filterable by profile / status / source / broker status / alert type / min score / has-red-flags; each card shows score, status, a **prominent recommended action**, reasons ±, missing fields, red flags, broker status + evidence, the **latest alert's status/channel/reason/timestamp**, price history when available, and two collapsed debug sections: **🔍 Debug: parsed fields** (every field the parser extracted, for QA) and **📝 QA notes** (a free-text note you can attach per listing — see "Real-world QA checklist" below).

## WhatsApp (Twilio)

Required `.env` vars — **all four** must be set for real WhatsApp delivery to be attempted (any missing var falls back to console):

```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
ALERT_WHATSAPP_TO=whatsapp:+9725XXXXXXXX
```

### Testing with the Twilio Sandbox (free, ~2 minutes)

1. Sign up at [console.twilio.com](https://console.twilio.com) and open **Messaging → Try it out → Send a WhatsApp message**.
2. Copy your **Account SID** and **Auth Token** into `.env`.
3. The sandbox's "From" number is shown on that page (default `whatsapp:+14155238886` already in `.env.example`).
4. From the phone you want alerts on, send the sandbox's **"join &lt;code-word&gt;"** message to that number on WhatsApp. (Sessions expire after ~72h of inactivity — rejoin if alerts stop arriving.)
5. Set `ALERT_WHATSAPP_TO` to your own number in `whatsapp:+<countrycode><number>` format.
6. Run the app and click **Send test alert** on the dashboard. The dashboard's "WhatsApp (Twilio) status" panel shows SENT/FAILED, the channel used, and the exact Twilio error (with a plain-English hint for common cases like the recipient not having joined the sandbox) — without ever printing your auth token.

### Fallback behavior

If any Twilio var is missing, or if a real Twilio request fails for any reason (bad credentials, recipient not joined, rate limit, network error), the alert is **always** also written to the console running `npm run dev` / `npm run scheduler` — an alert is never silently lost. The dashboard always shows whether Twilio is configured and, per-alert, which channel actually delivered it.

## Duplicate suppression & price-drop re-alerts

- Listings are matched by **fingerprint** (Yad2 ID → source URL → content hash). Re-pasting the same listing **updates the existing row in place** rather than creating a duplicate — this is what "Add Listing" means by "existing listing updated."
- Each (profile, listing) match remembers the **price and key fields (rooms/balcony/parking/broker status) at the time its last alert was sent**.
- On a re-scan of the same listing:
  - **Nothing changed** (same price, same key fields) → the match is refreshed silently; no new alert. Logged as a `SUPPRESSED` alert record (reason `NO_CHANGE_SUPPRESSED`, or `DUPLICATE_SUPPRESSED` if flagged as a duplicate).
  - **Price dropped** → a `📉 Price drop detected` alert fires (old price / new price / difference / link), if the profile's "Re-alert on price drop or major changes" option is on (default: on).
  - **Rooms/balcony/parking/broker status changed** (and price didn't drop) → a `🔄 Listing details changed` alert fires, same setting.
  - A **price increase** never triggers a re-alert.
- This is one setting per profile (`priceDropReAlert`, shown as "Re-alert if this listing later drops in price or changes materially") covering both price-drop and material-change re-alerts, to keep the UI simple.

## The 5-minute watcher

```bash
npm run scheduler
```

Every `SCAN_INTERVAL_MIN` minutes (default 5), each tick: polls the IMAP inbox for new alert emails → ingests them through parse/dedup/score → **sends WhatsApp immediately for strong matches** (possible/borderline matches are surfaced separately by the review digest — see "Reliability & safety nets") → processes any leftover unscanned listings (manual paste, seed) → records source health → pings the external dead-man's switch. `npm run ingest:email` runs a single tick for setup validation, and the dashboard's **Run scan now** button triggers the same pass on demand. In production it runs under `launchd` (see `ops/`) so it survives reboots.

## Scoring (summary)

- Hard rejects: deal-type mismatch, price >5% over max, wrong city, required feature explicitly absent, broker rules (`private_only`+broker, `broker_only`+private, `no_fee_only`+fee exists).
- Unknown fields never auto-reject — they reduce score and appear as *missing info* to ask about.
- `private_only` + unknown broker ⇒ capped at possible_match with "broker status unknown". These sub-threshold-but-on-criteria listings are **not dropped silently** — they're surfaced by the review digest (see "Reliability & safety nets").
- Private-preferred + broker listing ⇒ penalty, not rejection.
- Duplicates are detected (Yad2 ID → URL → content fingerprint, plus fuzzy text matching — see below) and update the existing listing rather than alerting again for no reason (see "Duplicate suppression & price-drop re-alerts" above).
- **Entry-date matching**: if a profile has a desired entry-by date, an immediate/flexible listing (מיידי/גמיש) or one whose parsed date is at/before that date scores a small bonus ("Entry date looks compatible"); a clearly later date is a soft penalty ("Entry date may be too late") — never a hard rejection; an entry date the parser couldn't read at all is just listed as missing info. Only simple `D.M`, `D/M`, and `D.M.YYYY`-style dates are understood (plus מיידי/גמיש) — no natural-language date math, and a date with no year assumes the current year.

## Fuzzy duplicate detection

Reposts of the same apartment across different sources (e.g. Yad2 → Facebook) often share no URL or ID. For listings with no exact fingerprint match, the app compares text against recent listings in the same city and a close price band (±3%, same room count if known) using token-overlap similarity — **after stripping generic real-estate boilerplate** (״להשכרה״, ״דירת״, ״מרפסת״, ״תיווך״, etc.) so that only distinguishing content (street/neighborhood, distinctive descriptions, negations like "no balcony") drives the match. This avoids the false-positive trap where two *different* apartments in the same city/price/room-count look similar purely because real-estate listings share so much common vocabulary. A likely match is flagged as a duplicate (capped score, suppressed re-alert) rather than merged — you can still see it on the Matches page.

## Tests

```bash
npm test
```

182 Vitest unit tests: parser extraction, broker classification, Yad2 ID extraction, scoring rules (price/location/brokerage/required-features/entry-date), fuzzy-duplicate detection (reworded reposts vs. genuinely different listings), and the alert-lifecycle decision (`decideAlertAction` — new match / price drop / material change / suppressed) plus Twilio fallback safety — all pure-function tests with no database or network required. The browser userscripts and pacing/lease logic are covered by standalone Node simulations.

## Stack

Next.js 14 (App Router) + TypeScript · Tailwind · Prisma + SQLite · server actions · Twilio REST (no SDK).

## Never commit secrets

`.env` and `dev.db` are gitignored. Only `.env.example` (placeholders) is committed.

# Israel Real Estate Agent 🏠

Personal, local-first **automatic** real-estate alert agent for Israel (rent + sale).

Define your search criteria once. The watcher checks your sources **every 5 minutes**, ingests new listings automatically, parses them (Hebrew/English), dedupes reposts, scores them 0–100 against your profiles — broker vs. private with the exact evidence phrase, red flags, recommended action — and **WhatsApps you immediately** when a strong match appears (console fallback when Twilio isn't configured).

**Personal-use tool. Not a SaaS. Localhost only.**

## How it works (the automatic loop)

```
Yad2 saved-search alerts ──► your email inbox ──► IMAP poll (every 5 min)
other portals / broker lists ─┘                        │
                                                parse → dedup → score
                                                       │
                              strong match ──► WhatsApp immediately
                              possible match ─► dashboard
                              repost/duplicate ► suppressed
                              price drop ─────► re-alert 📉
```

1. **You tell the portals what you want** — save your searches on Yad2 (and any other portal) and turn on their **email alerts (immediate mode)**, pointed at an inbox you control.
2. **The watcher polls that inbox every 5 minutes** (`npm run scheduler`) — every alert email is ingested through the full pipeline automatically.
3. **Strong matches hit your WhatsApp within one poll cycle.** Possible matches wait on the dashboard. Duplicates/reposts are suppressed. Price drops re-alert.

Setup for the automatic loop is ~5 minutes — see **Automatic ingestion setup** below.

## Daily workflow

There isn't one — that's the point. Keep `npm run scheduler` running; read your WhatsApp. Open the dashboard when you want to review possible matches, tune profiles, or check source health. **Manual paste still exists** ("Manual Add" in the nav) as a fallback for listings that don't arrive by email — a Facebook post you stumbled on, a broker's WhatsApp message — and as a parser-debug tool. It is not the main workflow.

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
- **Automatic ingestion is supported through safe, user-authorized sources**: email alerts from the portals' own saved-search feature (the primary path today), plus — as they become practical — approved APIs, public feeds, and other compliant connectors. The portals push listings to *you* through their official channels; the app reads what you already legitimately receive.
- Yad2 is a first-class source: its alert emails are recognized automatically (sender → `YAD2` source), and the Yad2 listing ID is extracted from the link for exact duplicate detection.
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
   EMAIL_ALLOWED_SENDERS="yad2"     # comma-separated From-header filters; empty = ingest all unseen mail
   ```
4. **On Yad2:** save your searches (matching your app profiles) and enable **email alerts in immediate mode** (one email per new listing — not the daily digest) to that inbox. Do the same on any other portal or broker mailing list; senders not matching `EMAIL_ALLOWED_SENDERS` are left unread for you.
5. **Validate:** `npm run ingest:email` runs one poll and prints what it found. Then leave `npm run scheduler` running — the dashboard's **🤖 Automatic ingestion** panel shows last check, last success, items found, and errors.

**How the mailbox is used:** the app reads **unseen** messages in the configured folder, ingests the ones from allowed senders, and marks them read. It never sends mail, never deletes anything, and the fingerprint dedup means a re-read email can't double-alert.

## Using it

1. **Dashboard** (`/`) — profiles overview, **Run scan now** (processes pending/demo listings), **Send test alert**.
2. **New Profile** — rent/sale, cities, price/rooms/size, features (balcony/parking/elevator/mamad as Required/Preferred/Indifferent), **broker filter** (הכל / רק ללא תיווך / רק בתיווך / עדיף ללא תיווך… / לא משנה), broker-fee preference, WhatsApp threshold (default 80) and dashboard threshold (default 60).
3. **Manual Add (fallback/debug)** — for listings that don't arrive by email (a Facebook post, a broker WhatsApp message) or for testing the parser: choose source, paste text and/or URL → same pipeline as automatic ingestion (parsed, scored, alerted if strong). Pasting a URL alone just saves it (with a nudge to add text). Re-pasting an existing listing (same Yad2 URL/ID, source URL, or matching content) **updates it in place** instead of creating a duplicate row — see "Duplicate suppression & price-drop re-alerts" below.
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

Every `SCAN_INTERVAL_MIN` minutes (default 5), each tick: polls the IMAP inbox for new alert emails → ingests them through parse/dedup/score → **sends WhatsApp immediately for strong matches** → processes any leftover unscanned listings (manual paste, seed) → records source health for the dashboard panel. `npm run ingest:email` runs a single tick for setup validation, and the dashboard's **Run scan now** button triggers the same pass on demand. Keep the watcher running in a terminal (or wrap it in `launchd`/`pm2` if you want it to survive reboots).

## Scoring (summary)

- Hard rejects: deal-type mismatch, price >5% over max, wrong city, required feature explicitly absent, broker rules (`private_only`+broker, `broker_only`+private, `no_fee_only`+fee exists).
- Unknown fields never auto-reject — they reduce score and appear as *missing info* to ask about.
- `private_only` + unknown broker ⇒ capped at possible_match with "broker status unknown".
- Private-preferred + broker listing ⇒ penalty, not rejection.
- Duplicates are detected (Yad2 ID → URL → content fingerprint, plus fuzzy text matching — see below) and update the existing listing rather than alerting again for no reason (see "Duplicate suppression & price-drop re-alerts" above).
- **Entry-date matching**: if a profile has a desired entry-by date, an immediate/flexible listing (מיידי/גמיש) or one whose parsed date is at/before that date scores a small bonus ("Entry date looks compatible"); a clearly later date is a soft penalty ("Entry date may be too late") — never a hard rejection; an entry date the parser couldn't read at all is just listed as missing info. Only simple `D.M`, `D/M`, and `D.M.YYYY`-style dates are understood (plus מיידי/גמיש) — no natural-language date math, and a date with no year assumes the current year.

## Fuzzy duplicate detection

Reposts of the same apartment across different sources (e.g. Yad2 → Facebook) often share no URL or ID. For listings with no exact fingerprint match, the app compares text against recent listings in the same city and a close price band (±3%, same room count if known) using token-overlap similarity — **after stripping generic real-estate boilerplate** (״להשכרה״, ״דירת״, ״מרפסת״, ״תיווך״, etc.) so that only distinguishing content (street/neighborhood, distinctive descriptions, negations like "no balcony") drives the match. This avoids the false-positive trap where two *different* apartments in the same city/price/room-count look similar purely because real-estate listings share so much common vocabulary. A likely match is flagged as a duplicate (capped score, suppressed re-alert) rather than merged — you can still see it on the Matches page.

## Tests

```bash
npm test
```

87+ Vitest unit tests: parser extraction, broker classification, Yad2 ID extraction, scoring rules (price/location/brokerage/required-features/entry-date), fuzzy-duplicate detection (reworded reposts vs. genuinely different listings), and the alert-lifecycle decision (`decideAlertAction` — new match / price drop / material change / suppressed) plus Twilio fallback safety — all pure-function tests with no database or network required.

## Stack

Next.js 14 (App Router) + TypeScript · Tailwind · Prisma + SQLite · server actions · Twilio REST (no SDK).

## Never commit secrets

`.env` and `dev.db` are gitignored. Only `.env.example` (placeholders) is committed.

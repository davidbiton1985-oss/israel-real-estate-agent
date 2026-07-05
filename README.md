# Israel Real Estate Agent 🏠

Personal, local-first real-estate search & alert agent for Israel (rent + sale).

Paste a listing (Yad2 / Facebook / WhatsApp / broker message / any text, Hebrew or English), and the agent parses it, checks for duplicates, scores it 0–100 against your search profiles, detects broker vs. private (with the exact evidence phrase), flags risks, and sends a WhatsApp alert for strong matches (console fallback when Twilio isn't configured).

**Personal-use tool. Not a SaaS. Localhost only.**

## Daily workflow (Quick Capture)

1. Open Yad2 or Facebook and find a listing.
2. Copy the listing's URL, and/or select and copy its text (an optional [bookmarklet](docs/browser-helper.md) can do this in one click).
3. Paste into **Add Listing — Quick Capture** in the app (URL field and/or text field).
4. Review the score, reasons, missing info, red flags, and the prominent **recommended action** on the Matches page.
5. If it's a strong match, you already got a WhatsApp alert (or a console message if Twilio isn't configured) — usually before you finish reading the card.

## Legal / safety stance

- **No scraping** of Yad2, Facebook, or any site behind logins, CAPTCHAs, rate limits, or robots.txt. The app never fetches a page on your behalf — you always paste the text/URL yourself.
- Yad2 is a first-class *source type*: you paste the listing URL and/or text; the Yad2 listing ID is extracted from the URL for exact duplicate detection. Future safe paths (user-assisted Yad2 email alerts, browser-assisted capture) plug into the same pipeline.
- URLs are stored as references only — the app does not fetch Yad2/Facebook pages.
- Pasting **only a URL** (no text) just saves the reference and extracts a Yad2 ID if present — it is intentionally **not** scored or alerted on until you paste the listing text too. See `docs/browser-helper.md`.

## Setup

Requirements: Node 20+.

```bash
cp .env.example .env          # optional: fill Twilio vars for real WhatsApp
npm install
npx prisma migrate dev        # creates SQLite db + runs seed (demo profile + 7 demo listings)
npm run dev                   # open http://localhost:3000
```

If the seed didn't run: `npm run db:seed`.

## Using it

1. **Dashboard** (`/`) — profiles overview, **Run scan now** (processes pending/demo listings), **Send test alert**.
2. **New Profile** — rent/sale, cities, price/rooms/size, features (balcony/parking/elevator/mamad as Required/Preferred/Indifferent), **broker filter** (הכל / רק ללא תיווך / רק בתיווך / עדיף ללא תיווך… / לא משנה), broker-fee preference, WhatsApp threshold (default 80) and dashboard threshold (default 60).
3. **Add Listing — Quick Capture** — choose source (Yad2/Facebook/WhatsApp/Manual/URL), paste text and/or URL → parsed, scored, and alerted immediately if strong. Pasting a URL alone just saves it (with a nudge to add text). Re-pasting a listing that already exists (same Yad2 URL/ID, source URL, or matching content) **updates it in place** instead of creating a duplicate row — see "Duplicate suppression & price-drop re-alerts" below.
4. **Matches** — filterable by profile / status / source / broker status / alert type / min score / has-red-flags; each card shows score, status, a **prominent recommended action**, reasons ±, missing fields, red flags, broker status + evidence, the **latest alert's status/channel/reason/timestamp**, and price history when available.

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

## 5-minute scheduler (foundation)

```bash
npm run scheduler
```

Processes queued/unscanned listings every `SCAN_INTERVAL_MIN` minutes (default 5). MVP performs **no live external polling** — this is the hook where future safe connectors (user-assisted Yad2 alert emails, browser-assisted capture) will feed listings.

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

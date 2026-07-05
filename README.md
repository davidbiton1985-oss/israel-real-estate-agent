# Israel Real Estate Agent 🏠

Personal, local-first real-estate search & alert agent for Israel (rent + sale).

Paste a listing (Yad2 / Facebook / WhatsApp / broker message / any text, Hebrew or English), and the agent parses it, checks for duplicates, scores it 0–100 against your search profiles, detects broker vs. private (with the exact evidence phrase), flags risks, and sends a WhatsApp alert for strong matches (console fallback when Twilio isn't configured).

**Personal-use tool. Not a SaaS. Localhost only.**

## Legal / safety stance

- **No scraping** of Yad2, Facebook, or any site behind logins, CAPTCHAs, rate limits, or robots.txt.
- Yad2 is a first-class *source type*: you paste the listing URL and/or text; the Yad2 listing ID is extracted from the URL for exact duplicate detection. Future safe paths (user-assisted Yad2 email alerts, browser-assisted capture) plug into the same pipeline.
- URLs are stored as references only — the app does not fetch Yad2/Facebook pages.

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
3. **Add Listing** — choose source (Yad2/Facebook/WhatsApp/Manual/URL), paste text and/or URL → parsed, dedup'd, scored, and alerted immediately if strong.
4. **Matches** — score, status, reasons ±, missing fields, red flags, broker status + evidence, recommended action.

## WhatsApp

Set in `.env` (Twilio WhatsApp sandbox works for personal use):

```
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
ALERT_WHATSAPP_TO=whatsapp:+9725XXXXXXXX
```

When unset, alerts print to the terminal running the app (console fallback) and matches are still visible in the dashboard.

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
- Duplicates are detected (Yad2 ID → URL → content fingerprint), shown, and never re-alerted.

## Stack

Next.js 14 (App Router) + TypeScript · Tailwind · Prisma + SQLite · server actions · Twilio REST (no SDK).

## Never commit secrets

`.env` and `dev.db` are gitignored. Only `.env.example` (placeholders) is committed.

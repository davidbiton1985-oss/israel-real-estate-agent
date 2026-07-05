# Israel Real Estate Agent — Master Architecture & Implementation Plan

**Status:** Specification (v1.1 — final decisions locked). No app code yet. This document is the source of truth to hand to **Fable 5** for implementation.
**Author:** Opus (council leader / product architect).
**Scope:** Personal, local-first, **active** real-estate *alert agent* for Israel (rent + sale). Polls safe sources every 5 minutes and pushes WhatsApp alerts as fast as possible for strong matches.

> **This is not just a dashboard — it is an active alert agent.** The dashboard is the control panel; the product is the *near-real-time discovery + alert loop*.

> **Builder note (Fable 5):** Build exactly what Sections 5–14 specify, **phase by phase**, stopping for review after each phase. Do not invent features. Never scrape behind login/CAPTCHA/rate-limit/robots.txt, and never use stealth/fingerprint evasion. These are hard legal boundaries, not preferences.

---

## 0. Assumptions & Locked Decisions

1. **Single user, single machine.** No multi-tenant auth. Dashboard binds to `localhost` only. Optional simple password via `.env` (Section: Security).
2. **Primary market:** Gush Dan + Sharon (pre-seed list in Section 7.5). Country-wide model; any city addable manually. Currency ₪ (ILS), timezone Asia/Jerusalem.
3. **Languages:** Hebrew (primary) + English, RTL-aware everywhere.
4. **Active agent, 5-minute cadence.** Default scan interval = **5 min**, per-source configurable. Strong matches → **immediate** WhatsApp; possible matches → dashboard (per profile). Duplicates never re-alert; price drops optionally re-alert.
5. **WhatsApp via Twilio** (MVP). Fallbacks: Email + in-app inbox + console. (Telegram deferred — see #8.)
6. **LLM extraction uses Claude** (Haiku default, Sonnet for hard cases) with a **regex/dictionary fallback so the app runs with zero API keys**.
7. **Local-first:** SQLite via Prisma (→ Postgres later, one-line swap).
8. **Telegram is OUT of MVP** (the apartments the user cares about aren't posted there). Connector architecture stays generic so Telegram is a later drop-in — but **no Telegram code in Phase 1 or Phase 2**.
9. **Yad2 is a first-class source from MVP** (see Section 9) — never "manual paste only," never vague future-work.
10. **Brokerage filtering is a first-class MVP feature** (Section 7.4 + 10).

**Model workflow (locked):**
- **Opus** — architecture, product reasoning, legal/ToS analysis, review of Fable's diffs, prompt design.
- **Fable 5** — actual multi-file repo implementation.
- **Sonnet** — cheaper/faster follow-ups: tests, README, UI polish, small fixes.
- **Rule:** recommend the model before each major prompt; use tokens wisely; **never let Fable build the whole project in one uncontrolled pass** — phase-by-phase with review after each phase.

---

## 1. Product Definition

**What we're building.** A personal, always-on real-estate *alert agent* for Israel. You describe what you want (rent or sale, in detail); the agent polls safe sources every ~5 minutes, normalizes messy Hebrew/English posts into structured data, scores each listing against each profile, deduplicates, flags risks and **brokerage status**, and pushes a concise WhatsApp alert within seconds for strong matches — with evidence and a recommended next action.

**Who the user is.** A serious buyer/renter who wants to be *first* to a good listing, never re-reads the same reposted apartment, wants to filter hard on **private vs. broker**, and wants red flags surfaced before making a call.

**Success.**
- **MVP:** Yad2/Facebook/broker-message paste + user URLs + demo connector produce scored, dedup'd, broker-classified matches; strong ones fire WhatsApp in seconds.
- **90-day:** ≥1 safe near-real-time Yad2 discovery path live (user-assisted email/alert or browser-assisted), <5% duplicate alerts, real viewings attributed to alerts.
- **North star:** *actionable alerts per week you actually acted on* — precision over volume.

---

## 2. MVP Scope

### Must be in v1
- Local dashboard (Next.js), localhost-only, optional `.env` password.
- **Active scheduler**: 5-min default, per-source config, cursors/checkpoints, alert queue, "Run scan now," pause/resume connectors.
- Multiple **search profiles** (rent **or** sale) with full criteria incl. **first-class brokerage filters** (Section 7).
- **Yad2 as a first-class source** (manual URL + manual paste + Yad2 parser skeleton + Yad2 dedup + listing-ID extraction + source-status enum) — Section 9.
- **Facebook** post/broker-message **manual paste** + user-provided FB link where possible.
- **User-provided URL** ingestion (robots-respecting single fetch, graceful "please paste" fallback).
- **Demo connector** (realistic seeded listings; app useful with zero keys).
- **Bilingual parser/extractor** → normalized Listing incl. **broker classification with evidence phrase** (Section 8).
- **Matching/scoring** 0–100 with brokerage rules, status, reasons±, missing fields, red flags, recommended action.
- **Duplicate detection** (cross-source + Yad2-specific).
- **Red-flag detection** (Section 11).
- **Alerts**: WhatsApp (Twilio) immediate for strong; Email + in-app fallback; throttle + alert dedup + price-drop re-alert.
- **Source health logs** with the full field set (Section 6).
- Pages: Overview, Profiles, Add/Edit Profile, Manual Add Listing, Listings, Matches, Alerts, Source Logs, Settings.
- `.env.example`, README (incl. Yad2 strategy section), seed/demo data, tests, git init + private GitHub repo.

### Should NOT be in v1
- **Telegram** (deferred; architecture-ready only).
- Any **unsafe Yad2/Facebook scraping** (no login/CAPTCHA/rate-limit/robots bypass, no stealth).
- Cloud hosting, multi-user accounts, complex auth, mobile app, ML price models, maps.
- Browser extension itself (spec'd as fast-follow; MVP only leaves the architecture ready).

### Planned (roadmap, prioritized)
1. **Yad2 user-assisted alert ingestion** (email/alert forward → parse) — top near-term.
2. **Browser-assisted capture** (extension/bookmarklet: "Send this Yad2/FB listing to my agent").
3. **Email-alert inbox** (IMAP) — pull into MVP only if trivially scaffoldable, else fast-follow.
4. Optional **third-party Yad2 data provider** connector (only if ToS/commercial-use verified).
5. Telegram, additional portal connectors, daily digest, price-history analytics, Postgres + VPS for true 24/7.

---

## 3. Recommended Model Workflow

| Task | Model | Why |
|---|---|---|
| Architecture, data model, scoring/brokerage rules, ToS/legal, this doc, prompt design, reviewing Fable diffs | **Opus** | High-leverage reasoning + risk. |
| Repo implementation: scaffolding, schema, parser, matching, connectors, scheduler, refactors, cross-file debugging | **Fable 5** | Codebase-level work. |
| README polish, unit tests, seed data, UI tweaks, single-file fixes, boilerplate | **Sonnet** | Fast + cheap on well-specified tasks. |
| **Council** (Opus-led) | Rare | Only major forks: WhatsApp provider, adopting a third-party Yad2 provider, scoring philosophy, deployment. |

**Discipline:** one build **phase per prompt**; Opus reviews the diff before the next phase; specs stay in `docs/` and are referenced by path (never re-pasted). **Fable stops after each phase and waits for review.**

---

## 4. Recommended Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 14 (App Router) + TypeScript** | One codebase (UI + API); great local DX; easy later deploy. |
| UI | **Tailwind + shadcn/ui** | Fast, clean, RTL-friendly. |
| Data fetching | **TanStack Query** + server actions | Simple, cache-friendly. |
| ORM/DB | **Prisma + SQLite** (→ Postgres) | Local-first; one-line DB swap. |
| Validation | **Zod** | Shared schemas across parser/API/forms. |
| Scheduler/worker | **node-cron worker process** (`tsx`) + per-source cursors | 5-min cadence, no Redis dependency for MVP. BullMQ+Redis is the documented upgrade for scale. |
| LLM extraction | **Anthropic Claude** (Haiku default, Sonnet hard) + **regex fallback** | Best HE+slang→JSON; runs with no key. |
| WhatsApp | **Twilio WhatsApp API** (sandbox for dev) | Official, works today. Meta Cloud API = documented alt. |
| Fallback alerts | **Email (nodemailer/Resend)** + **in-app inbox** + console | Redundancy; never silent. |
| Email-alert ingestion (fast-follow) | **IMAP (imapflow)** | Legitimate: user forwards portal alerts. |
| Testing | **Vitest** + **Playwright** (smoke) | Fast, TS-native. |
| Lint/format / pkg mgr | **ESLint + Prettier / pnpm** | Standard, fast. |

**Council-flagged:** Twilio vs Meta Cloud API long-term → **Twilio for MVP** (least verification friction). Third-party Yad2 provider → **only after ToS/commercial verification**.

---

## 5. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js App (localhost only)                   │
│  Frontend: Overview · Profiles · Add/Edit · Manual Add ·           │
│            Listings · Matches · Alerts · Source Logs · Settings     │
│  API layer: /api/profiles /api/listings /api/scan /api/alerts/test  │
└───────────────┬────────────────────────────────────────────────────┘
                │ (shared framework-free "core" library)
   ┌────────────┴─────────────────────────────────────────────────┐
   │  core/                                                        │
   │  ├─ connectors/  base · demo · manualPaste · urlFetch ·       │
   │  │               yad2 (first-class) · facebook · brokerMsg    │
   │  │               (telegram = later, not built)                │
   │  ├─ parser/      regex · dictionary.he.json · broker · llm    │
   │  ├─ normalize/   listing · geo(aliases) · yad2Id              │
   │  ├─ matching/    scoring · weights · brokerRules              │
   │  ├─ dedup/       fingerprint · fuzzy · yad2Dedup              │
   │  ├─ redflags/    rule set                                     │
   │  ├─ notify/      whatsapp · email · inapp (telegram later)    │
   │  ├─ scheduler/   cron · perSourceConfig · cursors · queue     │
   │  ├─ logging/     source health + scan-run logs               │
   │  └─ pipeline.ts  fetch→parse→normalize→dedup→match→alert      │
   └────────────┬─────────────────────────────────────────────────┘
                │
   ┌────────────┴───────────┐        ┌──────────────────────────────┐
   │  Prisma + SQLite       │◀──────▶│  Worker (node-cron, 5-min)     │
   │  single source of truth│        │  per-source polling + cursors; │
   └────────────────────────┘        │  alert queue; "Run scan now"   │
                                     │  calls the same pipeline()     │
                                     └──────────────────────────────┘
```

**Scheduler foundation (new, core to "active agent"):**
- **5-min default** interval; **per-source** interval + enable/disable + pause/resume.
- **Per-source rate-limit / safety controls** (min delay between requests, max requests/run).
- **Last-seen cursor/checkpoint** per source (e.g., last Yad2 listing IDs / last processed timestamp) to detect *new* items only.
- **Dedup before alerting.**
- **Alert queue**: strong matches dequeued and sent **immediately**; possible matches recorded dashboard-only per profile threshold.
- **Price-drop / material-change re-alert** option.
- **Connector-failure alert** after N (default 3) consecutive failures.

Everything else (frontend/API/DB/parser/matching/dedup/notify/logging/future-deploy) as in v1.0, now with brokerage + Yad2 + scheduler woven in.

---

## 6. Data Model (Prisma entities)

All tables include `id`, `createdAt`, `updatedAt`. `Json` fields validated by Zod.

### SearchProfile
- `id`, `name`, `active`
- `dealType` `enum{RENT, SALE}`
- `criteria` `Json` — full profile schema (Section 7) incl. **brokerage + fee filters**.
- **Alert config:** `whatsappThreshold` (default 80), `dashboardThreshold` (default 60), `notificationChannel`, `quietHoursStart/End`, `duplicateSuppression` (default true), `priceDropReAlert` (default true).
- `scanFrequencyMin` (default 5)
- `lastScannedAt`
- Relations: `matches[]`

### Listing (normalized — Section 8)
- `id`, `source` `enum{DEMO, MANUAL, URL, YAD2, FACEBOOK, BROKER_MSG, EMAIL, OTHER}`
- `yad2SourceStatus` `enum{MANUAL_URL, MANUAL_PASTE, USER_ASSISTED_ALERT, BROWSER_ASSISTED, THIRD_PARTY_API_OPTIONAL, DIRECT_CONNECTOR_RESEARCH_REQUIRED}` (nullable; set when source=YAD2)
- `sourceUrl`, `sourceRef` (external id), `yad2ListingId` (nullable; extracted from URL/text)
- `dealType` `enum{RENT, SALE, UNKNOWN}`
- `rawText`, `language` `enum{HE, EN, MIXED, UNKNOWN}`
- `fields` `Json` — normalized Listing (all criteria + **broker fields**)
- **Broker (denormalized for fast filter/UI):** `brokerStatus` `enum{PRIVATE, BROKER, UNKNOWN}`, `brokerEvidenceText` (the exact phrase that caused classification), `brokerFeeStatus` `enum{NONE, EXISTS, UNKNOWN}`, `brokerFeeText`
- `images` `Json`, `publishedAt`, `ingestedAt`
- `fingerprint`, `isDuplicateOf` (nullable FK)
- `priceHistory` `Json` (array of {amount, seenAt}) — powers price-drop re-alert
- `extractionMethod` `enum{REGEX, LLM, HYBRID}`, `extractionConfidence` (0–1)
- `redFlags` `Json`
- `status` `enum{NEW, PARSED, MATCHED, ARCHIVED}`
- Relations: `matches[]`, `connectorLog` (FK)

### Match
- `id`, `profileId` (FK), `listingId` (FK)
- `score` (0–100), `status` `enum{STRONG, POSSIBLE, WEAK, REJECTED}`
- `reasonsPositive` `Json`, `reasonsNegative` `Json`
- `missingFields` `Json`, `redFlags` `Json`
- `brokerStatus`, `brokerFeeStatus`, `brokerEvidenceText` (snapshot for the card/alert)
- `recommendedAction`, `scoreBreakdown` `Json`
- `alertedAt` (nullable), `alertChannel`
- Unique: (`profileId`, `listingId`)

### Alert (+ alert queue)
- `id`, `matchId` (FK), `channel` `enum{WHATSAPP, EMAIL, INAPP}`
- `priority` `enum{IMMEDIATE, QUEUED}` (strong→IMMEDIATE)
- `status` `enum{QUEUED, SENDING, SENT, FAILED, SUPPRESSED}`
- `messageBody`, `providerMessageId`, `error`
- `throttleKey` (hash(profileId+listingFingerprint)), `reason` `enum{NEW_MATCH, PRICE_DROP, MATERIAL_CHANGE, CONNECTOR_FAILURE}`
- `queuedAt`, `sentAt`

### SourceConnector
- `id`, `kind` `enum{DEMO, MANUAL, URL, YAD2, FACEBOOK, BROKER_MSG, EMAIL}`, `name`, `enabled`
- `status` `enum{ACTIVE, PAUSED, DISABLED}` (pause/resume)
- `config` `Json` (per-kind incl. yad2SourceStatus mode, URL list, rate-limit knobs)
- `intervalMin` (default 5), `minDelayMs`, `maxRequestsPerRun` (safety/rate-limit)
- `cursor` `Json` (last-seen checkpoint: last IDs / last timestamp)
- `consecutiveErrorCount`, `lastRunAt`, `lastSuccessAt`, `nextCheckAt`
- Relations: `logs[]`

### SourceConnectorLog (source health)
- `id`, `connectorId` (FK)
- `lastCheckTime`, `nextCheckTime`, `lastSuccessAt`
- `startedAt`, `finishedAt`, `durationMs`
- `listingsFound`, `listingsNew`, `matchesCreated`
- `errors` `Json`, `blockedOrRateLimited` (bool), `consecutiveErrorCount`
- `status` `enum{OK, PARTIAL, ERROR, BLOCKED}`, `message`

### NotificationSettings / AppSettings
- `defaultChannel`, `whatsappEnabled`, `emailEnabled`, `globalQuietHours`, `maxAlertsPerHour`, `connectorFailureAlertThreshold` (default 3), `dailyDigestEnabled`
- `defaultScanIntervalMin` (5), `llmEnabled`, `llmModelExtract`, `llmModelHard`, `locale`, `dashboardPasswordHash` (optional, from `.env` bootstrap)

### GeoAlias (seeded)
- `id`, `canonical`, `aliases` `Json` (HE/EN/transliterations), `parentCity`. Pre-seeded with Section 7.5 cities.

---

## 7. Search Profile Schema

`criteria` JSON (Zod-validated). Buckets: **required / preferred / negative / dealBreakers / tolerances**, plus first-class **brokerage** and **alert** config.

### 7.1 Core
```jsonc
{
  "dealType": "RENT | SALE",
  "location": { "cities": ["Ganei Tikva"], "neighborhoods": [], "streets": [],
                "avoidMainRoads": true, "radiusKm": null },
  "budget": { "min": null, "max": 7500, "currency": "ILS",
              "includeArnona": false, "includeVaad": false },
  "size": { "minSqm": 80, "maxSqm": null },
  "rooms": { "min": 4, "max": 5 },
  "bedrooms": { "min": null }, "bathrooms": { "min": 1 },
  "floor": { "min": null, "max": null, "notGroundFloor": false, "notTopFloor": false },
  "features": {
    "elevator": "REQUIRED|PREFERRED|INDIFFERENT|EXCLUDE",
    "parking": "PREFERRED", "balcony": "REQUIRED", "garden": "INDIFFERENT",
    "storage": "PREFERRED", "mamad": "REQUIRED", "accessibility": "INDIFFERENT",
    "airCondition": "PREFERRED", "bars": "INDIFFERENT", "solarHeater": "INDIFFERENT"
  },
  "condition": ["RENOVATED","NEW"], "furnished": "ANY|FURNISHED|PARTIAL|UNFURNISHED",
  "entry": { "date": "2026-09-01", "flexible": true, "immediate": false },
  "petsAllowed": "REQUIRED|PREFERRED|INDIFFERENT",
  "keywords": { "include": ["משופצת"], "exclude": ["שותפים","roommate"] },
  "notes": ""
}
```

### 7.2 Rent-specific
```jsonc
"rent": { "maxArnonaMonthly": null, "maxVaadMonthly": null,
          "contractMonths": { "min": 12 }, "optionToExtend": "PREFERRED",
          "guaranteesOk": true }
```

### 7.3 Sale-specific
```jsonc
"sale": { "maxPricePerSqm": null, "tabuClear": "REQUIRED|PREFERRED|INDIFFERENT",
          "urbanRenewal": "WANT|AVOID|INDIFFERENT",
          "sellerType": ["PRIVATE","DEVELOPER"], "mortgageNotes": "" }
```

### 7.4 Brokerage filters — **first-class MVP feature**
```jsonc
"brokerage": {
  "status": "any | private_only | broker_only | private_preferred_broker_allowed_if_strong_match | unknown_allowed",
  "fee": "no_fee_only | fee_allowed | unknown_allowed | max_fee_if_known",
  "maxFeeIfKnown": null   // used only when fee = max_fee_if_known
}
```
**Hebrew UI labels (status):**
| value | Hebrew label |
|---|---|
| `any` | הכל |
| `private_only` | רק ללא תיווך |
| `broker_only` | רק בתיווך |
| `private_preferred_broker_allowed_if_strong_match` | עדיף ללא תיווך, אבל תיווך מותר אם הנכס מתאים מאוד |
| `unknown_allowed` | לא משנה / גם לא ידוע |

**Fee labels:** `no_fee_only` = רק ללא עמלת תיווך · `fee_allowed` = עמלה מותרת · `unknown_allowed` = גם לא ידוע · `max_fee_if_known` = עמלה עד סכום מסוים (אם ידוע).

### 7.5 Pre-seed cities (Gush Dan + Sharon focus)
Ganei Tikva · Kiryat Ono · Petah Tikva · Givat Shmuel · Ramat Gan · Tel Aviv · Ramat HaSharon · Herzliya · Hod HaSharon · Raanana · Yehud-Monosson · Or Yehuda. **Any city addable manually.** Each seeded into `GeoAlias` with Hebrew + English + common transliterations.

### 7.6 Meta buckets & default alert behavior
```jsonc
"requiredFields": ["location.cities","rooms.min","features.mamad"],
"dealBreakers": ["budget.max","features.mamad"],
"tolerances": { "priceOverBudgetPct": 8, "roomsUnderMin": 0.5, "sizeUnderMinPct": 10 }
```
**Default profile alert behavior (new-profile defaults):** scan every **5 min**; **WhatsApp threshold 80+**; **dashboard-only threshold 60+**; **duplicate suppression ON**; **price-drop re-alert ON**; **connector-failure alert after 3 consecutive failures**.

---

## 8. Listing Normalization Schema

Every source converts `RawItem` → this canonical object (stored in `Listing.fields`). Unknown = `null`; guessed values carry low confidence.

```jsonc
{
  "dealType": "RENT|SALE|UNKNOWN",
  "propertyType": "APARTMENT|HOUSE|GARDEN_APT|PENTHOUSE|DUPLEX|STUDIO|UNIT|OTHER|UNKNOWN",
  "location": { "city": "Ganei Tikva", "cityCanonical": "GANEI_TIKVA",
                "neighborhood": null, "street": null, "houseNo": null, "geoConfidence": 0.9 },
  "price": { "amount": 7200, "currency": "ILS", "perSqm": null,
             "arnonaMonthly": null, "vaadMonthly": null, "utilitiesNote": null },
  "rooms": 4, "bedrooms": null, "bathrooms": 1, "toilets": null,
  "sizeSqm": 100, "balconySqm": null, "plotSqm": null,
  "floor": 2, "totalFloors": 4, "onGroundFloor": false, "onTopFloor": false,
  "features": { "elevator": true, "parking": null, "parkingCount": null, "balcony": true,
                "garden": null, "storage": null, "mamad": null, "accessibility": null,
                "airCondition": null, "bars": null, "solarHeater": null, "renovated": true },
  "condition": "RENOVATED|NEW|GOOD|OLD|NEEDS_RENO|UNKNOWN",
  "furnished": "FURNISHED|PARTIAL|UNFURNISHED|UNKNOWN",
  "entry": { "date": null, "immediate": false, "flexible": null },
  "petsAllowed": null,

  // BROKER — first-class, with evidence
  "broker": {
    "status": "PRIVATE | BROKER | UNKNOWN",
    "evidenceText": "ללא תיווך",          // exact phrase that drove classification
    "feeStatus": "NONE | EXISTS | UNKNOWN",
    "feeText": null,                       // e.g. "דמי תיווך: חודש שכירות"
    "brokerName": null,
    "sellerType": "PRIVATE|BROKER|DEVELOPER|UNKNOWN"
  },

  "rent": { "contractMonths": null, "optionToExtend": null, "guaranteesRequired": null },
  "sale": { "tabuStatus": "CLEAR|SHARED|UNREGISTERED|UNKNOWN", "evacuationDate": null,
            "urbanRenewal": "TAMA38|PINUI_BINUI|NONE|UNKNOWN", "mortgageNotes": null },

  "contact": { "phone": null, "name": null },
  "images": [], "listingUrl": null,
  "source": "YAD2|FACEBOOK|BROKER_MSG|URL|DEMO|MANUAL|EMAIL|OTHER",
  "yad2ListingId": null,                   // extracted from URL/text when source=YAD2
  "publishedAt": null,
  "meta": { "language": "HE|EN|MIXED", "extractionMethod": "REGEX|LLM|HYBRID",
            "extractionConfidence": 0.0, "fieldConfidence": {}, "rawText": "…" }
}
```

**Broker classification (parser, HE + EN).** The broker sub-parser scans text for signal phrases, sets `status` + `evidenceText`, and independently sets `feeStatus`.

*Private / no-broker signals:* `ללא תיווך`, `בלי תיווך`, `פרטי`, `מפרטי`, `ישירות מבעל הדירה`, `ישירות מהבעלים`, `ללא עמלת תיווך`, `no broker`, `owner direct`, `private listing`.
*Broker signals:* `תיווך`, `מתיווך`, `משרד תיווך`, `מתווך`, `מתווכת`, `עמלת תיווך`, `דמי תיווך`, `broker`, `agent`, `agency`.
*Conflict handling:* if both appear (e.g., "ללא עמלת תיווך" contains "תיווך"), the negation/"private" phrase wins for `status`; record the exact matched phrase in `evidenceText`. Fee phrases (`עמלת תיווך`/`דמי תיווך` with an amount) drive `feeStatus=EXISTS`; explicit `ללא עמלת תיווך` → `NONE`; otherwise `UNKNOWN`.

**Yad2 listing-ID extraction.** From URL patterns (e.g., `/item/{id}` or `?...id=...`) and from pasted text when an ID/ref is present. Used for Yad2-specific dedup and as `sourceRef`.

**Slang/abbrev normalization** (dictionary-driven, tested): `חד'`→rooms, `מ"ר`→sqm, `ממ"ד`→mamad, `כ.כניסה/חניה`→parking, `מיידי`→immediate, `גמיש`→flexible, `ק"ק`→ground floor, `ש"ח/₪/NIS`→price, etc.

---

## 9. Source Ingestion Strategy

**Hard rule:** no login/CAPTCHA/rate-limit/robots bypass; no stealth/fingerprint evasion; no "scrape at all costs." Where automation isn't safe, ship a manual or semi-automatic flow.

### MVP source priority order
1. **Yad2** — manual URL + manual paste (first-class).
2. **Facebook** — post / manual paste.
3. **WhatsApp / broker message** paste.
4. **User-provided URL** input.
5. **Demo connector** (testing).
6. **Email-alert ingestion** — only if simple to scaffold now, else fast-follow.
7. Future safe real-estate website connectors.

### 9.1 Yad2 — FIRST-CLASS (ranked ingestion strategy)

Yad2 is one of the most important sources. It gets its own source type, parser skeleton, dedup, listing-ID extraction, source-status enum, UI presence, README section, and an architecture ready to upgrade to near-real-time discovery **if a safe path is validated** — without rewriting the system.

**`yad2SourceStatus` enum (per listing / connector mode):**
`MANUAL_URL` · `MANUAL_PASTE` · `USER_ASSISTED_ALERT` · `BROWSER_ASSISTED` · `THIRD_PARTY_API_OPTIONAL` · `DIRECT_CONNECTOR_RESEARCH_REQUIRED`.

**Ranked ingestion paths (documented; MVP builds #1–#2 manual + scaffolds the rest):**

| Rank | Path | What it is | Legal/ToS | Reliability | Freshness | MVP action |
|---|---|---|---|---|---|---|
| 1 | **User-assisted alert** | User creates Yad2 **saved searches** and enables Yad2 **alerts/emails/app notifications**, then **forwards** the email/text/link to the agent → parse → match → WhatsApp. | ✅ Legitimate (user's own alerts). | High | **Near-real-time** (as fast as Yad2 notifies). | **Primary automated path.** MVP: accept forwarded content via manual paste + URL now; wire email-forward inbox as fast-follow. Status `USER_ASSISTED_ALERT`. |
| 2 | **Manual URL + manual paste** | User pastes a Yad2 listing URL or the listing text. App fetches the single user-provided URL respecting robots/ToS; if blocked, asks user to paste. | ✅ | High (user-driven) | On-demand | **Build in Phase 1.** Status `MANUAL_URL` / `MANUAL_PASTE`. |
| 3 | **Browser-assisted** | Extension/bookmarklet: "Send this Yad2 listing to my agent," user-initiated extraction from a page the user is **already viewing**. No CAPTCHA bypass, no hidden scraping, no mass crawling. | ✅ (user-in-the-loop) | Med-High | Real-time when user browses | **Scaffold status + endpoint** now; build extension as fast-follow. Status `BROWSER_ASSISTED`. |
| 4 | **Official/public capabilities** | Investigate: public listing URLs, public pages, **sitemaps**, RSS, saved-search **emails**, any **official API / partner feed**. Use only genuinely public + permitted surfaces, robots-respecting. | ⚠️ Verify per-surface | Varies | Sitemap = discovery-only, coarse freshness | **Document findings**; enable only permitted surfaces. |
| 5 | **Sitemap-assisted discovery** | If Yad2 exposes public sitemaps, use for *discovery* of public listing URLs (then user-permitted fetch). | ⚠️ Check robots/ToS | Med | Low-Med (sitemaps lag) | Research task; not relied on for near-real-time. |
| 6 | **Third-party API / data provider** | Commercial scraper/data APIs. **Optional connector only.** Must verify legality, ToS, **commercial-use rights**, reliability, cost, maintainability, block-risk before any use. | ⚠️ Must verify | Varies | Varies | **Optional connector interface only.** Status `THIRD_PARTY_API_OPTIONAL`. Council decision before enabling. |
| 7 | **Direct technical connector** | Only if a compliant + reliable direct path exists. Otherwise **research-required**, not built. | ❌ unless verified | — | — | Status `DIRECT_CONNECTOR_RESEARCH_REQUIRED`. Not built in MVP. |

**Architecture readiness:** the Yad2 connector implements the generic `Connector` interface with a `yad2SourceStatus` mode field, its own parser skeleton (`parser/yad2`), and Yad2 dedup by `yad2ListingId`. Upgrading from manual → user-assisted → browser-assisted → (optional) provider is a **config/mode change**, not a rewrite.

### 9.2 Facebook (safe MVP)
- **Manual paste** of Facebook posts and broker/private messages.
- **User-provided FB post/link** input where possible (no login-wall/CAPTCHA bypass).
- **No group polling/scraping in Phase 1.**
- Future: **browser-assisted** capture of a post the user is already viewing.

### 9.3 WhatsApp / broker messages
- **Manual paste** of broker/private WhatsApp messages → parsed like any listing (broker classification applies).

### 9.4 User-provided URL / real-estate websites
- Single explicit fetch, robots-respecting, graceful "please paste" fallback. Legitimate RSS/feeds/official APIs where a site offers them. Per-site ToS checked.

### 9.5 Email-alert ingestion
- IMAP on a dedicated inbox the user forwards portal alerts to. **MVP only if trivially scaffoldable; else fast-follow.** (This is also the delivery mechanism for Yad2 path #1.)

### 9.6 Telegram — **deferred, not built**
Removed from MVP by decision. Connector architecture stays generic so Telegram is a later drop-in. **No Telegram code in Phase 1 or Phase 2.**

---

## 10. Matching / Scoring Algorithm (0–100)

Deterministic, explainable pure function. Pipeline: **Hard rejects → weighted dimensions → penalties/bonuses → red-flag adjustment → clamp → status.**

### Step 1 — Hard rejects (score 0, REJECTED)
- Any **dealBreaker** violated (e.g., over `budget.max` beyond `priceOverBudgetPct`).
- `dealType` mismatch.
- Any `EXCLUDE` feature present or **exclude keyword** matched.
- Known location outside profile scope.
- **Brokerage hard rejects:**
  - profile `private_only` **and** listing `brokerStatus = BROKER` → **reject**.
  - profile `broker_only` **and** listing `brokerStatus = PRIVATE` → **reject**.
  - profile fee `no_fee_only` **and** listing `brokerFeeStatus = EXISTS` → **reject**.

> Missing ≠ disqualifying. Unknown brokerage does **not** hard-reject (see Step 3).

### Step 2 — Weighted dimensions (base 100 pool; tunable)
Price 22 · Location 20 · Rooms 12 · Size 10 · Required features 14 · Preferred features 8 · Keywords 5 · Freshness 5 · **Brokerage 4** · (Rent add-ons: arnona/vaad/contract; Sale add-ons: ₪/sqm, tabu, urban renewal, seller type — redistributed within pool).

### Step 3 — Missing-data & brokerage-unknown handling
- Each relevant unknown → partial/neutral contribution + added to `missingFields`.
- **Brokerage unknown rules:**
  - profile `private_only` + listing `UNKNOWN` → **possible_match**, add missing field **"broker status unknown"** (not a reject).
  - profile `unknown_allowed` → unknown is fine, no penalty.
- Excessive missingness caps max score (e.g., ≤84) and sets action to "verify before acting."

### Step 4 — Penalties & bonuses
- **`private_preferred_broker_allowed_if_strong_match` + listing `BROKER`** → apply a **penalty**, but **do not reject** if overall match is strong (i.e., only rejects if the penalized score still falls below dashboard threshold).
- Fee `max_fee_if_known` + known fee over `maxFeeIfKnown` → penalty (reject only if it's also a dealBreaker).
- Soft penalties: price in tolerance band, slight size/rooms under, disliked floor, furnished mismatch.
- Bonuses: exact street, mamad present, private when preferred, extra parking, freshness <24h.

### Step 5 — Red-flag adjustment (Section 11)
Each flag subtracts a configured amount; strong duplicate caps status at POSSIBLE.

### Step 6 — Status & alerting
- **STRONG ≥ profile.whatsappThreshold (default 80)** → enqueue **IMMEDIATE WhatsApp**.
- **POSSIBLE ≥ dashboardThreshold (default 60)** and below WhatsApp threshold → **dashboard-only**.
- **WEAK 40–59 · REJECTED <40** or hard-reject.
- Never alert twice for same (profile,listing) unless **price-drop/material-change** re-alert is on.

**Output (`MatchResult`):** `score`, `status`, `reasonsPositive[]`, `reasonsNegative[]`, `missingFields[]`, `redFlags[]`, `brokerStatus`, `brokerFeeStatus`, `brokerEvidenceText`, `recommendedAction`, `scoreBreakdown{}`. **Brokerage status is always shown in match cards and WhatsApp alerts.**

---

## 11. Red-Flag Detection (Israel-specific)

Rule-based; severity INFO/WARN/HIGH; human string each.

**Price/value:** suspiciously below area ₪/sqm baseline (seeded, editable) → possible bait; sale price present but size unknown; "price on request."
**Identity/broker:** broker/private **ambiguous** (claims לל"ת but mentions agency); broker fee unstated on obvious-broker post; same phone across many "private" posts (broker farming).
**Content quality:** no/few photos; no address / vague location; too much missing info; very short/template post.
**Freshness/duplication:** claims "immediate" but signals old repost; **possible duplicate** across sources / same Yad2 ID; reposted with **changed price** (note delta).
**Sale:** tabu/registration unclear or unregistered; urban-renewal timeline/approval unclear; missing evacuation date; floor/elevator inconsistency.
**Rental:** unusually heavy guarantees/checks; arnona/vaad omitted in high-arnona city.
**Behavioral:** pressure language; asks to pay before viewing → **HIGH** scam flag.

---

## 12. Notification Design

### WhatsApp message format
```
🏠 New real-estate match: {score}/100
Type: {Rental|Sale}
Area: {city/neighborhood/street}
Price: ₪{amount}{ /mo for rent }
Rooms: {rooms} · Size: {sqm} sqm
Balcony: {Y/N/?} · Parking: {…} · Elevator: {…} · Mamad: {…}
Broker: {Private | Broker | Unknown}
Broker fee: {None | Exists | Unknown}
Evidence: {"ללא תיווך" | "מתיווך" | …}
Why it matched: {top 2–3 positive reasons}
Missing info: {top missing fields}
Red flags: {none | list}
Recommended action: {action}
Link: {listingUrl}
```

### Delivery model (active agent)
- **Strong (≥ WhatsApp threshold):** enqueue **IMMEDIATE** and send WhatsApp within seconds.
- **Possible (≥ dashboard threshold, below WhatsApp):** **dashboard-only** (no WhatsApp) unless profile says otherwise.
- **Fallback chain (never silent):** WhatsApp(Twilio) → Email → **always** in-app inbox + console. "Send test WhatsApp" verifies config and reports exact failure.

### Throttling & dedup
- `maxAlertsPerHour` global + per-profile caps; quiet hours queue non-urgent (STRONG may override).
- `throttleKey = hash(profileId + listingFingerprint)`; **never** alert same profile+listing twice.
- **Price-drop / material-change re-alert (default ON):** if an already-alerted listing's price drops ≥X% (or key info materially improves), send a short "update" alert (reason `PRICE_DROP`/`MATERIAL_CHANGE`).
- **Connector-failure alert** after **3** consecutive failures (reason `CONNECTOR_FAILURE`).

### Daily summary (later)
Optional 08:00 Asia/Jerusalem digest of the day's POSSIBLE+ matches not individually alerted.

---

## 13. UI / Pages

RTL-aware, HE+EN, Tailwind + shadcn. Nav: Overview · Profiles · Listings · Matches · Alerts · Source Logs · Settings.

- **Overview:** counts (active profiles, new matches today, alerts sent, last scan health), **"Run scan now"** + **"Send test WhatsApp"**, recent strong matches, **connector health chips** (active/paused, last/next check, blocked/rate-limited, consecutive errors).
- **Profiles (list):** cards w/ name, RENT/SALE, active toggle, **brokerage status chip (Hebrew label)**, WhatsApp/dashboard thresholds, scan freq, last scan, #matches.
- **Add/Edit Profile:** sectioned form mirroring Section 7 incl. a dedicated **Brokerage** section (status radio with Hebrew labels + fee preference + maxFeeIfKnown) and **Alerts** section (WhatsApp threshold, dashboard threshold, duplicate suppression, price-drop re-alert, quiet hours, scan frequency). Live Zod validation.
- **Manual Add Listing:** source selector incl. **Yad2 / Facebook / Broker message / URL**; big HE/EN textarea + optional URL/images; **Yad2 URL input** and **Yad2 pasted-text** paths; **"Parse preview"** shows normalized fields incl. **broker status + evidence phrase** and confidence before saving; save → matches immediately.
- **Listings:** filterable table (source incl. **Yad2 badge + yad2SourceStatus**, deal type, city, price, rooms, freshness, **broker/private chip**, fee chip, duplicate badge, red-flag badge). Row → detail (normalized fields, raw text, broker evidence, red flags, matched profiles, price history).
- **Matches:** table sorted by score; filters (profile, status, **brokerage**, has-red-flags). Row → detail: score breakdown, reasons±, missing fields, red flags, **broker status + evidence**, recommended action, resend alert, link.
- **Alerts:** log (sent/failed/suppressed/queued) w/ channel, priority, reason (new/price-drop/failure), timestamp, provider id, error, exact message body. Resend/test.
- **Source Logs:** per-connector health — last_check_time, next_check_time, last_success_at, listings found/new, matches, errors, **blocked/rate-limited**, consecutive_error_count; **pause/resume**, enable/disable, interval + rate-limit config.
- **Settings:** notification toggles + default channel, default scan interval, LLM on/off + models, quiet hours, alert caps, connector-failure threshold, per-city ₪/sqm baselines, GeoAlias editor (pre-seeded cities), optional dashboard password, export/import.

---

## 14. Implementation Plan for Fable 5 (phased)

Overall build order (each phase = one prompt, review after each; **Fable stops after each phase**):

1. **Phase 1 — Foundation** (skeleton, DB schema, core types, dashboard shell, seed, connector + scheduler + health + queue + profile/brokerage/normalization schemas, Yad2 first-class placeholders, FB/broker-msg/demo source types, `.env.example`, README). *Detailed prompt below.*
2. Phase 2 — Parser + broker classification + normalization + geo aliases (regex/dictionary; LLM behind flag). *No Telegram.*
3. Phase 3 — Matching/scoring engine + brokerage rules + tests.
4. Phase 4 — Dedup (incl. Yad2 ID) + red flags.
5. Phase 5 — Scheduler runtime (5-min cron, cursors, alert queue, pause/resume, failure counting).
6. Phase 6 — Notifications (Twilio WhatsApp immediate + email + in-app; price-drop re-alert; test endpoint).
7. Phase 7 — Yad2 manual URL fetch (robots-respecting) + Yad2 parser + Yad2 dedup wired.
8. Phase 8 — Facebook + broker-message + user-URL ingestion wired.
9. Phase 9 — Full UI wiring (all pages, brokerage filters, Parse-preview, connector controls).
10. Phase 10 — Email-alert ingestion (if pursued) / browser-assisted endpoint scaffold.
11. Phase 11 — Tests, README finalize (incl. Yad2 strategy), Playwright smoke, git + private GitHub repo.

> The **copy-paste-ready Phase-1 prompt** is delivered separately in the chat (and should be pasted to Fable 5 verbatim). Fable must build **only Phase 1** and stop for review.

---

## 15. Token & Cost Efficiency Plan

- Specs live in `docs/MASTER_PLAN.md`; Fable references by path, never re-pastes.
- **One phase per prompt**, Opus reviews the diff before the next.
- Opus = architecture + review + prompt tweaks. Fable = implementation phases. Sonnet = README/tests/seed/UI polish/small fixes.
- Small focused follow-ups (e.g., "add 3 broker-parser tests" → Sonnet), not whole-app regenerations.
- Council only for major forks (WhatsApp provider, third-party Yad2 provider, scoring philosophy, deployment).
- Runtime cost control: Haiku for extraction, Sonnet only on low-confidence listings; regex handles most for free; LLM optional.

---

## 16. Risks & Open Questions

**Risks**
1. **Yad2 near-real-time depends on the user-assisted/browser-assisted paths** (no unsafe scraping). *Mitigation:* make forwarding + browser capture delightful; architecture ready to upgrade by config.
2. **5-min cadence needs the Mac awake** (or a VPS later). *Mitigation:* document VPS path; MVP = interval scans while running.
3. **Third-party Yad2 provider** legality/ToS/commercial-use/block-risk unknown. *Mitigation:* optional connector only, Council decision before enabling.
4. **Broker classification ambiguity** (mixed phrases). *Mitigation:* negation-aware rules + `evidenceText` shown to user + unknown never hard-rejects.
5. **WhatsApp deliverability** (Twilio sandbox opt-in / 24h window). *Mitigation:* Email + in-app fallback.
6. **False duplicate/red-flag** could hide good listings. *Mitigation:* mark, never delete; show in UI.

**Open questions (non-blocking)**
- A. Twilio vs Meta Cloud API long-term (Council when volume matters).
- B. Email-alert inbox in MVP or fast-follow? (Default: fast-follow unless trivial.)
- C. Build the browser extension now or after MVP? (Default: after; scaffold endpoint now.)
- D. Adopt a third-party Yad2 data provider? (Requires ToS/commercial verification first.)
- E. Which neighborhoods/₪-per-sqm baselines to seed first within the pre-seeded cities.

---

## Security defaults (MVP)
- **Localhost-only** binding.
- **Optional simple dashboard password** via `.env` (`DASHBOARD_PASSWORD`); no complex auth in Phase 1.
- **Never commit secrets or `.env`.** Provide **`.env.example` only**. `.gitignore` must include `.env`, `dev.db`, `node_modules`, `.next`.

# RE-Agent Reliability Council — reusable prompt

A 4-seat review of the apartment-monitor's zero-miss posture. Paste the SHARED
CONTEXT into each of the four role prompts below. Keep the framing accurate and
current so the council doesn't waste effort re-litigating settled decisions.

---

## SHARED CONTEXT (prepend to every role)

**What this is.** A personal, single-user apartment-alert tool that David runs on
his own always-on Mac to avoid missing rental listings in his criteria. It is a
DEFENSIVE, legitimate, authorized tool operating only on the user's own accounts
and his own logged-in browser session.

**Hard ethical line (a constraint, not a preference — never propose crossing it).**
No CAPTCHA solving, no anti-bot / fingerprint / proxy evasion, no fake accounts,
no scraping-at-scale, no third-party services that would do any of those on the
user's behalf. When a site shows a verification page the tool BACKS OFF and the
human solves it. All ingestion is either the user reading his own session or
official push channels he's subscribed to.

**Match criteria.** RENT · Ganei Tikva / Kiryat Ono / Herzliya (Glil Yam only) /
Glil Yam · ₪7,500–9,500 · 3–5 rooms · one active profile.

**Architecture (repo `/Users/david/israel-real-estate-agent`, Node/Next/TS,
Prisma→Neon).** Two Tampermonkey userscripts in the user's own logged-in tabs are
the primary sensors: `docs/yad2-tab-watcher.user.js` (pinned Yad2 search, reload
7–10 min, jittered, backs off on PerimeterX) and `docs/facebook-groups-watcher.user.js`
(a `#re-agent` notifications tab: reads notifications + round-robin chronological
group sweep with scroll-until-overlap; reader role held by a localStorage lease).
They POST to a local server (`src/app/api/capture/route.ts` → parse `parser.ts` /
`bulkExtract.ts` → dedup `dedup.ts` → score `matching.ts` → alert `alert.ts`).
Reliability layer already shipped: batched review digest for on-criteria items
below the WhatsApp bar (`reviewDigest.ts`, launchd 5×/day), daily "alive+24h"
heartbeat (`systemStatus.ts`), two per-sensor watchdogs (`ops/*-watchdog.ts`),
and a scheduler dead-man ping (`pingHealthcheck`, no-op unless HEALTHCHECK_URL set).

**Settled — do NOT re-open or recommend:**
- Yad2's own saved-search EMAIL alerts are a PAID feature (~₪69/mo) the user will
  not buy. There is no free first-party Yad2 push (no RSS, no public API; the
  gw.yad2 gateway is bot-protected and off-limits). Do not suggest paying for it
  or scraping the gateway.
- Facebook per-post group notification emails are DISCONTINUED; the Graph Groups
  API was removed in 2024. There is no complete legitimate FB feed.
- Realta (realta.co.il) free Telegram alerts are the accepted independent
  redundancy channel. Assume it's in use; don't re-derive it.
- Literal zero-miss is impossible under these constraints. The agreed goal is
  "near-zero capture + LOUD detection of every gap + human review of everything
  borderline." Observability should stay cheap (persist the diag blobs the server
  already logs + one anomaly line in the daily heartbeat) — NOT a full metrics
  stack or heavy coverage ledger.

**Known real incidents to design out:** a reader tab lost its role on restart →
22h silent blindness (since fixed by the lease, but verify the fix is complete);
a real matching post never captured because FB never notified (video post); both
tabs parked behind CAPTCHAs; a sweep whose effect couldn't be verified from the
DB (working-but-idle looked identical to broken).

Analysis only — do not modify code or data. Cite file:line. Rank findings by
likelihood × impact, and mark each SILENT (no trace) vs DETECTABLE.

---

## SEAT 1 — Reliability Architect
Design the target architecture for "zero SILENT miss." Cover: is zero-miss
achievable per source (Yad2 IDs are enumerable; FB posts are not); independent
ingestion legs per source with NO single point of failure; completeness /
reconciliation / gap-detection; how to make each sensor PROVABLY complete, not
just alive (heartbeat ≠ coverage); dead-man switches and self-healing for the
restart/sleep/tab-loss class. Deliver: (A) achievability verdict, (B) target per
source, (C) top-3 changes by impact/effort, (D) the single first thing to do.

## SEAT 2 — Data-Source Realist
Ground the team in what ingestion channels ACTUALLY exist in 2026 for Yad2 and FB
groups (verify with web search; note uncertainty). Rank each channel by
completeness / durability / legitimacy / effort. Respect the "settled" list above
— confirm or correct it, don't re-propose paid Yad2 email or scraping. Deliver:
per-source ranked table, the single best legitimate channel per source, and the
hard truths the council must accept.

## SEAT 3 — Red-Team / Failure Taxonomy
Enumerate EVERY way a matching apartment is silently missed, stage by stage:
capture (tab/CAPTCHA/sleep/lease/sweep holes), pre-ingestion extraction drops
(rooms/city/OCR/`isNotAnOffer` false-positives — these leave NO DB trace), parse
(price/city mis-parse → hard reject), scoring (threshold/`capAtPossible` caps),
dedup (false-positive suppression), alert/delivery (Twilio queued≠delivered,
console-counts-as-sent, suppression), observability (green-health-while-blind).
Each with mechanism, likelihood×impact, SILENT vs DETECTABLE, file:line. End with
a ranked top-8 and note which failure classes leave no trace at all.

## SEAT 4 — Pragmatic Ops / Product
Reality check for a one-person, one-Mac tool. Reframe the objective in one
sentence. Rank the moving parts by how likely each is to break SILENTLY and how
painful to keep alive. Give 3–5 highest-ROI moves (favor: human-review digest
over perfect auto-filtering; borderline items alert rather than drop; cheap
dead-man switches that guarantee David learns of any lapse within ~30 min). State
plainly what to NOT build (over-engineering to avoid). Ground every point in this
specific setup.

# UX Council — 2026-07-17

Four independent reviewers (product flows, mobile/PWA, alerts-first, red-team), each
read the code with a different lens. Visual styling was explicitly out of scope
(owned by the design-system import from David's other app). This file preserves the
findings + the agreed build order.

## One-line verdicts

- **Product flows:** capture→score→alert is strong; the decide→act half doesn't exist
  (no triage state, no tap-to-call, dead apartments keep re-alerting).
- **Mobile/PWA:** push-first product, pull-only app — resumes from background hours
  stale with no refresh; notification taps skip the app's own context.
- **Alerts-first:** the pipeline earns trust, the messages spend it — lock-screen
  line 1 is a category label, tap target is "first URL in the text", nothing to act on.
- **Red-team:** success-biased feedback — `sendAlert` cannot return FAILED (unreachable
  code), "סרוק עכשיו" doesn't scan what the header implies, `dashboardThreshold` is a
  placebo, channel naming contradicts itself across 5 surfaces.

## Convergent findings (multiple members independently)

1. **Tap-to-call (P0 ×2):** extract lister phone from rawText → tel:/wa.me buttons on
   cards AND a tappable line inside the Telegram/push message.
2. **Deep links land nowhere (all 4):** push tap → external site (no score/reasons);
   "פרטים מלאים" → top of generic list; digest tap → one random listing. Fix: a
   per-apartment detail surface everything links to.
3. **Triage state (P0):** userStatus on Listing (NEW/CONTACTED/VIEWING/DISMISSED/WON) +
   one-tap chips; dismissed drops from hero/list and blocks re-alerts
   (decideAlertAction gains a userDismissed input). Unlocks "what's new since I
   looked", review queue UI for 79-scorers, viewing tracking.
4. **Trust bugs (P0):** every sendAlert failure path returns status:"SENT" (console
   fallback recorded as delivered); scan banner identical for success/failure;
   Telegram cell green on env-var presence alone; errors hidden in title= tooltips
   (don't exist on iOS).

## Wave plan

### Wave 1 — trust + quick wins (shipped first)
- alert.ts: console fallback = FAILED when a real channel is configured; test banner
  shows real outcome; visible inline errors (no title tooltips).
- Alert message restructure: line 1 = `🏠 עיר · חד' · מחיר · תיווך · ציון X`; SEP off
  the first screen; "לוודא בשיחה: …" from missingFields; deltas lead re-alert
  messages; shared rawText cap for all builders (price-drop/material were uncapped).
- sendAlert(message, {url, tag, ambient}): structured push URL (no first-URL regex),
  notification tag+renotify (price drop replaces stale card), digest links to the
  dashboard, ambient tier = Telegram silent + no push (heartbeat, digest).
- One channel noun everywhere; Hebrew test message naming the real channel.
- AutoRefresh on visibilitychange/pageshow (>60s) + flash-banner param cleanup
  (history.replaceState) so restored PWA URLs don't replay stale banners.
- Dashboard honesty: drop "דירות במערכת"/"פרופילי חיפוש" tiles; strongCount matches
  hero where-clause; truthful dashboardThreshold hint; scan button says what it does;
  debug dumps behind ?debug=1; empty state branches on active-filters.

### Wave 2 — close the decide→act loop
- Phone extraction (parser → Listing.phone) + 📞 tel:/wa.me actions everywhere.
- Triage states + chips + effect on alerts and lists.
- Per-apartment detail view (/matches/[id] or highlight+expand) — facts, reasons,
  call script, phone, triage; push/telegram deep-link lands here.
- Dashboard becomes "דורש טיפול / מה חדש" + review-queue tile.
- pushsubscriptionchange handler + mount-time subscription re-sync (silent push death).

### Wave 3 — polish
- Mobile filter bar (collapsed, auto-submit, preset score chips), loading.tsx
  skeletons + useTransition on filters, 44px touch targets + two-step delete,
  offline shell + error.tsx, watchdog message rewrite (diagnosis-first, blast
  radius), heartbeat "closest miss" line, duplicate badge names its canonical,
  profile tab routes to edit-existing.

## Key files
`src/core/alert.ts` · `src/core/webpush.ts` · `src/core/pipeline.ts` ·
`src/core/reviewDigest.ts` · `scripts/daily-heartbeat.ts` · `ops/fb-watchdog.ts` ·
`public/sw.js` · `src/app/page.tsx` · `src/app/matches/page.tsx` ·
`src/app/actions.ts` · `src/components/ProfileForm.tsx` · `prisma/schema.prisma`

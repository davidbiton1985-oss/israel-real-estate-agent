// WhatsApp alert via Twilio REST API (plain fetch, no SDK). Console fallback if not configured.
// Also hosts the pure alert-lifecycle decision (decideAlertAction) so it is unit-testable
// without touching Prisma.
import type { Listing, Profile } from "@prisma/client";
import { CITIES } from "./parser";
import { sendWebPushBroadcast } from "./webpush";

// Alerts go out in HEBREW — the user wants the ORIGINAL Hebrew Facebook post,
// not an English parse. We prepend only a compact one-line Hebrew summary.
const BROKER_HE: Record<string, string> = { PRIVATE: "פרטי", BROKER: "מתיווך" };
const SEP = "────────────";

/** Canonical city ("Herzliya") → its Hebrew name ("הרצליה"). Shared by alert
 * messages and the dashboard, so listings always display in Hebrew. */
export function hebrewCity(canonical: string | null): string | null {
  if (!canonical) return null;
  const entry = CITIES.find((c) => c.canonical === canonical);
  return entry?.aliases.find((a) => /[א-ת]/.test(a)) ?? canonical;
}

/** Replace canonical English city names inside free text (scorer reason
 * strings like "עיר מבוקשת: Ganei Tikva") with their Hebrew names. */
export function hebrewizeCities(text: string): string {
  let out = text;
  for (const c of CITIES) {
    const he = c.aliases.find((a) => /[א-ת]/.test(a));
    if (he && out.includes(c.canonical)) out = out.split(c.canonical).join(he);
  }
  return out;
}

/** Compact Hebrew summary line: city · rooms · price · broker (omitting unknowns). */
function summaryLine(listing: Listing): string {
  return [
    hebrewCity(listing.city),
    listing.rooms != null ? `${listing.rooms} חד'` : null,
    listing.price != null ? `${listing.price.toLocaleString()} ₪` : "מחיר לא צוין",
    BROKER_HE[listing.brokerStatus] ?? null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const FB_SURFACE_LABELS: Record<string, string> = {
  GROUP: "group",
  PAGE: "page",
  PROFILE: "profile",
  PUBLIC_POST: "public post",
  SHARED: "shared post",
  MARKETPLACE: "marketplace",
  UNKNOWN: "unknown",
};

/** e.g. "Facebook group — דירות להשכרה בגני תקווה (by דוד כהן)"; page+broker → broker page. */
export function describeFbSource(listing: Listing): string | null {
  if (listing.source !== "FACEBOOK") return null;
  let surface = FB_SURFACE_LABELS[listing.fbSurface ?? "UNKNOWN"] ?? "unknown";
  if ((listing.fbSurface === "PAGE" || listing.fbSurface === "PUBLIC_POST") && listing.brokerStatus === "BROKER") {
    surface = "broker page";
  }
  const parts = [`Facebook ${surface}`];
  if (listing.fbSourceName) parts.push(`— ${listing.fbSourceName}`);
  if (listing.fbAuthor) parts.push(`(by ${listing.fbAuthor})`);
  return parts.join(" ");
}

// Twilio caps a WhatsApp body at ~1600 chars; a long post (rawText up to 3000)
// used to fail (error 21617) → console fallback → retried forever, identically.
// EVERY builder caps through here — price-drop/material re-alerts hit the same
// wall as new matches.
function capBody(rawText: string | null | undefined): string {
  const raw = (rawText ?? "").trim();
  return raw.length > 1200 ? raw.slice(0, 1200) + "…\n(הטקסט קוצר — הפרטים המלאים בקישור)" : raw;
}

// The user's chosen alert shape, lock-screen-first: LINE 1 IS THE DECISION
// (city · rooms · price · broker · score) because the push title is derived
// from it — never a category label the user already knows. Then the ORIGINAL
// Hebrew post verbatim, then the direct link. No English, no field dump.
export function buildAlertMessage(
  listing: Listing,
  extras?: { score?: number; missingFields?: string[] }
): string {
  const facts = [summaryLine(listing), extras?.score != null ? `ציון ${extras.score}` : null]
    .filter(Boolean)
    .join(" · ");
  // The winning move is calling within minutes — the lister's number is a
  // first-class line, contiguous E.164 so Telegram renders it tap-to-call.
  const phone = listing.phone ? `📞 ${listing.phone}` : null;
  // What the parser could NOT confirm = the call script for the first phone call.
  const verify =
    extras?.missingFields && extras.missingFields.length > 0
      ? `לוודא בשיחה: ${extras.missingFields.slice(0, 3).join(" · ")}`
      : null;
  return [`🏠 ${facts}`, phone, verify, SEP, capBody(listing.rawText), "", `🔗 ${listing.url ?? "—"}`]
    .filter((l): l is string => l !== null)
    .join("\n");
}

export function buildPriceDropMessage(_profile: Profile, listing: Listing, oldPrice: number, newPrice: number): string {
  const diff = oldPrice - newPrice;
  const pct = oldPrice > 0 ? Math.round((diff / oldPrice) * 100) : 0;
  // The delta IS the news — it leads, with the words carrying direction
  // (a bare arrow between digits is bidirectionally ambiguous in RTL).
  return [
    `📉 עכשיו ${newPrice.toLocaleString()} ₪ במקום ${oldPrice.toLocaleString()} ₪ (${pct}%-)`,
    summaryLine(listing),
    SEP,
    capBody(listing.rawText),
    "",
    `🔗 ${listing.url ?? "—"}`,
  ].join("\n");
}

const FIELD_HE: Record<string, string> = {
  rooms: "חדרים",
  balcony: "מרפסת",
  parking: "חניה",
  brokerStatus: "סטטוס תיווך",
};

function fmtValHe(v: unknown): string {
  if (v === true) return "כן";
  if (v === false) return "לא";
  if (v === null || v === undefined) return "לא ידוע";
  if (v === "PRIVATE") return "פרטי";
  if (v === "BROKER") return "מתיווך";
  if (v === "UNKNOWN") return "לא ידוע";
  return String(v);
}

export function buildMaterialChangeMessage(
  _profile: Profile,
  listing: Listing,
  prevSnapshotJson: string | null,
  currentSnapshotJson: string
): string {
  let prev: Record<string, unknown> = {};
  let curr: Record<string, unknown> = {};
  try {
    prev = prevSnapshotJson ? JSON.parse(prevSnapshotJson) : {};
  } catch {
    prev = {};
  }
  try {
    curr = JSON.parse(currentSnapshotJson);
  } catch {
    curr = {};
  }
  const changes: string[] = [];
  for (const key of Object.keys(curr)) {
    // Words carry the direction — "היה X → עכשיו Y" stays unambiguous in RTL.
    if (prev[key] !== curr[key])
      changes.push(`${FIELD_HE[key] ?? key}: היה ${fmtValHe(prev[key])} → עכשיו ${fmtValHe(curr[key])}`);
  }
  // The first change leads — it's the news and becomes the push title.
  return [
    `🔄 ${changes[0] ?? "הפרטים עודכנו"} · ${summaryLine(listing)}`,
    changes.length > 1 ? `שינויים נוספים: ${changes.slice(1).join("; ")}` : null,
    SEP,
    capBody(listing.rawText),
    "",
    `🔗 ${listing.url ?? "—"}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Twilio config + sending
// ---------------------------------------------------------------------------
const REQUIRED_TWILIO_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "ALERT_WHATSAPP_TO"] as const;

export function twilioConfigVars(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_TWILIO_VARS.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
}

/**
 * True if the user INTENDS WhatsApp delivery (any Twilio var is set). When true,
 * a console-only outcome means the phone did NOT get the alert (misconfig /
 * partial config / a typo'd var) — so it must NOT count as delivered, or a
 * `.env` regression would silently mark every match "alerted" and suppress it
 * forever. A user with NO Twilio vars at all is a console-only user; for them
 * console IS the channel and counts as delivered.
 */
export function intendsWhatsapp(): boolean {
  return REQUIRED_TWILIO_VARS.some((k) => !!process.env[k]);
}

// ---------------------------------------------------------------------------
// Telegram — the preferred channel. Unlike WhatsApp it has NO 24-hour delivery
// window, so it can't silently stop delivering (the Twilio-sandbox trap). Free,
// reliable, one HTTP call. Configured with a bot token + chat id.
// ---------------------------------------------------------------------------
const REQUIRED_TELEGRAM_VARS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] as const;
export function telegramConfigured(): boolean {
  return REQUIRED_TELEGRAM_VARS.every((k) => !!process.env[k]);
}
async function sendTelegram(message: string, silent = false): Promise<{ ok: boolean; error?: string }> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN!;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID!,
        text: message,
        disable_web_page_preview: false,
        // Ambient messages (heartbeat, digest) deliver without a buzz — the
        // interruption budget is reserved for apartments.
        disable_notification: silent,
      }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `Telegram ${res.status}: ${(await res.text()).slice(0, 160)}` };
  } catch (e) {
    return { ok: false, error: `Telegram exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** @deprecated use twilioConfigVars() for details on what's missing */
export function twilioConfigured(): boolean {
  return twilioConfigVars().configured;
}

// Best-effort hints for common Twilio WhatsApp error codes. Not exhaustive —
// Twilio's own `message` field (always shown) is the source of truth.
const TWILIO_ERROR_HINTS: Record<string, string> = {
  "20003": "Authentication failed — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
  "21211": "Invalid 'To' number — must look like whatsapp:+972501234567.",
  "21606": "The 'From' number is not a valid Twilio WhatsApp sender.",
  "63007": "Sender/channel not found — sandbox session may have expired.",
  "63016": "Recipient hasn't joined your Twilio WhatsApp Sandbox — send the join code from their WhatsApp to the sandbox number first.",
  "63018": "Rate limit exceeded for this WhatsApp sender.",
};

function parseTwilioError(bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { code?: number; message?: string };
    const hint = j.code != null ? TWILIO_ERROR_HINTS[String(j.code)] : undefined;
    const base = `Twilio error ${j.code ?? "?"}: ${j.message ?? bodyText}`;
    return hint ? `${base} — ${hint}` : base;
  } catch {
    return `Twilio error: ${bodyText.slice(0, 200)}`;
  }
}

export interface SendAlertResult {
  channel: "telegram" | "whatsapp" | "console";
  status: "SENT" | "FAILED";
  /** Populated whenever Twilio was attempted and failed, even if console fallback succeeded. */
  error?: string;
  twilioAttempted: boolean;
}

export interface SendAlertOptions {
  /** Structured tap target for the push notification — never re-parsed from prose. */
  url?: string;
  /** Web-push notification tag: same tag REPLACES the stale card (e.g. listing id). */
  tag?: string;
  /** Ambient = Telegram delivered silently, no web push. For heartbeat/digest. */
  ambient?: boolean;
}

/**
 * Delivery preference: Telegram (no 24h window) → WhatsApp (Twilio) → console.
 * Never throws. Never logs secrets.
 */
export async function sendAlert(message: string, opts: SendAlertOptions = {}): Promise<SendAlertResult> {
  // Web Push to the installed PWA runs in PARALLEL with the channels below —
  // best-effort, never throws, no-op unless VAPID keys are configured.
  // Ambient messages skip it entirely: only apartments reach the lock screen.
  if (!opts.ambient) await sendWebPushBroadcast(message, { url: opts.url, tag: opts.tag });

  // Telegram first when configured — it has no 24-hour delivery window, so it
  // can't silently stop delivering the way the WhatsApp sandbox does.
  if (telegramConfigured()) {
    const t = await sendTelegram(message, opts.ambient === true);
    if (t.ok) return { channel: "telegram", status: "SENT", twilioAttempted: false };
    console.error("[alert] Telegram send failed, falling back to WhatsApp/console:", t.error);
  }

  const { configured, missing } = twilioConfigVars();

  // A console outcome counts as SENT only for a true console-only user (no
  // real channel configured or intended anywhere). If Telegram and/or WhatsApp
  // is intended and we still land on console, the phone did NOT get it —
  // that's a FAILED delivery and the UI must say so, never a quiet green.
  const intendsRealChannel = telegramConfigured() || intendsWhatsapp();

  if (!configured) {
    console.log(
      `\n===== 🏠 ALERT (console — Twilio not configured; missing: ${missing.join(", ")}) =====\n` +
        message +
        "\n======================================================\n"
    );
    return {
      channel: "console",
      status: intendsRealChannel ? "FAILED" : "SENT",
      twilioAttempted: false,
      error: telegramConfigured()
        ? "Telegram send failed and WhatsApp is not configured — alert did NOT reach the phone."
        : `Twilio not configured (missing: ${missing.join(", ")})`,
    };
  }

  try {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const body = new URLSearchParams({
      From: process.env.TWILIO_WHATSAPP_FROM!,
      To: process.env.ALERT_WHATSAPP_TO!,
      Body: message,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (res.ok) return { channel: "whatsapp", status: "SENT", twilioAttempted: true };

    const errMsg = parseTwilioError(await res.text());
    console.error("[alert] Twilio send failed:", errMsg);
    console.log("\n===== 🏠 ALERT (console fallback — Twilio failed) =====\n" + message + "\n=======================================\n");
    return { channel: "console", status: "FAILED", twilioAttempted: true, error: errMsg };
  } catch (e) {
    const errMsg = `Twilio request exception: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[alert]", errMsg);
    console.log("\n===== 🏠 ALERT (console fallback — Twilio exception) =====\n" + message + "\n=======================================\n");
    return { channel: "console", status: "FAILED", twilioAttempted: true, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// Pure alert-lifecycle decision — no I/O, fully unit-testable.
// ---------------------------------------------------------------------------
export type AlertAction = "NEW_MATCH" | "PRICE_DROP" | "MATERIAL_CHANGE" | "SUPPRESSED" | "NONE";

export interface AlertDecisionInput {
  scoreQualifies: boolean; // score >= profile.whatsappThreshold
  isDuplicate: boolean; // listing.isDuplicateOf != null
  /** listing.userStatus === "DISMISSED" — David said no; nothing re-alerts, not even a price drop. */
  userDismissed: boolean;
  alreadyAlertedBefore: boolean; // match.alerted — NOT lastAlertedPrice!=null (null price would re-alert forever)
  lastAlertedPrice: number | null;
  currentPrice: number | null;
  priceDropReAlert: boolean; // profile setting; also gates material-change re-alert
  lastAlertedSnapshot: string | null;
  currentSnapshot: string;
}

/**
 * A field counts as materially changed ONLY between two KNOWN values
 * (4 rooms → 5 rooms). known↔unknown flips are extraction variance from
 * re-reading the same post (a real alert fired on "חניה: כן ← לא ידוע" —
 * the apartment didn't change, the read did) — never alert-worthy.
 */
export function materiallyChanged(prevJson: string | null, currJson: string): boolean {
  let prev: Record<string, unknown> = {};
  let curr: Record<string, unknown> = {};
  try {
    prev = prevJson ? JSON.parse(prevJson) : {};
  } catch {
    return false;
  }
  try {
    curr = JSON.parse(currJson);
  } catch {
    return false;
  }
  for (const key of Object.keys(curr)) {
    const p = prev[key];
    const c = curr[key];
    if (p != null && c != null && p !== c) return true;
  }
  return false;
}

/**
 * Decides what (if anything) to alert for a single (profile, listing) pair.
 * Priority when re-alerting: PRICE_DROP > MATERIAL_CHANGE > SUPPRESSED.
 */
export function decideAlertAction(input: AlertDecisionInput): AlertAction {
  if (input.userDismissed) return "NONE"; // David's verdict outranks everything
  if (!input.scoreQualifies) return "NONE";
  if (input.isDuplicate) return "SUPPRESSED";
  if (!input.alreadyAlertedBefore) return "NEW_MATCH";

  if (
    input.priceDropReAlert &&
    input.currentPrice != null &&
    input.lastAlertedPrice != null &&
    input.currentPrice < input.lastAlertedPrice
  ) {
    return "PRICE_DROP";
  }
  if (
    input.priceDropReAlert &&
    input.lastAlertedSnapshot != null &&
    materiallyChanged(input.lastAlertedSnapshot, input.currentSnapshot)
  ) {
    return "MATERIAL_CHANGE";
  }
  return "SUPPRESSED";
}

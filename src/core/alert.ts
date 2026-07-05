// WhatsApp alert via Twilio REST API (plain fetch, no SDK). Console fallback if not configured.
// Also hosts the pure alert-lifecycle decision (decideAlertAction) so it is unit-testable
// without touching Prisma.
import type { Listing, Profile } from "@prisma/client";
import type { MatchResult } from "./matching";

function fmt(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

export function buildAlertMessage(profile: Profile, listing: Listing, result: MatchResult): string {
  const feeLabel = listing.brokerFeeStatus === "NONE" ? "None" : listing.brokerFeeStatus === "EXISTS" ? "Exists" : "Unknown";
  const brokerLabel = listing.brokerStatus === "PRIVATE" ? "Private" : listing.brokerStatus === "BROKER" ? "Broker" : "Unknown";
  return [
    `🏠 New real-estate match: ${result.score}/100`,
    `Profile: ${profile.name}`,
    `Type: ${listing.dealType === "SALE" ? "Sale" : "Rental"}`,
    `Area: ${[listing.city, listing.neighborhood, listing.street].filter(Boolean).join(", ") || "Unknown"}`,
    `Price: ${listing.price != null ? `₪${listing.price.toLocaleString()}` : "Unknown"}`,
    `Rooms: ${listing.rooms ?? "Unknown"}`,
    `Size: ${listing.sizeSqm != null ? `${listing.sizeSqm} sqm` : "Unknown"}`,
    `Balcony: ${fmt(listing.balcony)}`,
    `Parking: ${fmt(listing.parking)}`,
    `Elevator: ${fmt(listing.elevator)}`,
    `Broker: ${brokerLabel}`,
    `Broker fee: ${feeLabel}`,
    `Evidence: ${listing.brokerEvidence ?? "—"}`,
    `Why matched: ${result.reasonsPositive.slice(0, 3).join("; ") || "—"}`,
    `Missing info: ${result.missingFields.slice(0, 4).join(", ") || "none"}`,
    `Red flags: ${result.redFlags.join("; ") || "none detected"}`,
    `Recommended action: ${result.recommendedAction}`,
    `Link: ${listing.url ?? "—"}`,
  ].join("\n");
}

export function buildPriceDropMessage(profile: Profile, listing: Listing, oldPrice: number, newPrice: number): string {
  const diff = oldPrice - newPrice;
  const pct = oldPrice > 0 ? Math.round((diff / oldPrice) * 100) : 0;
  return [
    `📉 Price drop detected`,
    `Profile: ${profile.name}`,
    `Area: ${[listing.city, listing.neighborhood, listing.street].filter(Boolean).join(", ") || "Unknown"}`,
    `Old price: ₪${oldPrice.toLocaleString()}`,
    `New price: ₪${newPrice.toLocaleString()}`,
    `Difference: ₪${diff.toLocaleString()} (${pct}% off)`,
    `Rooms: ${listing.rooms ?? "Unknown"} · Size: ${listing.sizeSqm != null ? `${listing.sizeSqm} sqm` : "Unknown"}`,
    `Link: ${listing.url ?? "—"}`,
  ].join("\n");
}

function fmtVal(v: unknown): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (v === null || v === undefined) return "Unknown";
  return String(v);
}

export function buildMaterialChangeMessage(
  profile: Profile,
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
    if (prev[key] !== curr[key]) changes.push(`${key}: ${fmtVal(prev[key])} → ${fmtVal(curr[key])}`);
  }
  return [
    `🔄 Listing details changed`,
    `Profile: ${profile.name}`,
    `Area: ${[listing.city, listing.neighborhood, listing.street].filter(Boolean).join(", ") || "Unknown"}`,
    `Changes: ${changes.join("; ") || "details updated"}`,
    `Link: ${listing.url ?? "—"}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Twilio config + sending
// ---------------------------------------------------------------------------
const REQUIRED_TWILIO_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "ALERT_WHATSAPP_TO"] as const;

export function twilioConfigVars(): { configured: boolean; missing: string[] } {
  const missing = REQUIRED_TWILIO_VARS.filter((k) => !process.env[k]);
  return { configured: missing.length === 0, missing };
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
  channel: "whatsapp" | "console";
  status: "SENT" | "FAILED";
  /** Populated whenever Twilio was attempted and failed, even if console fallback succeeded. */
  error?: string;
  twilioAttempted: boolean;
}

/**
 * Sends via WhatsApp if Twilio env is fully configured, otherwise (or on any
 * Twilio failure) falls back to a console log. Never throws. Never logs the
 * auth token — only the response body/message.
 */
export async function sendAlert(message: string): Promise<SendAlertResult> {
  const { configured, missing } = twilioConfigVars();

  if (!configured) {
    console.log(
      `\n===== 🏠 ALERT (console — Twilio not configured; missing: ${missing.join(", ")}) =====\n` +
        message +
        "\n======================================================\n"
    );
    return {
      channel: "console",
      status: "SENT",
      twilioAttempted: false,
      error: `Twilio not configured (missing: ${missing.join(", ")})`,
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
    return { channel: "console", status: "SENT", twilioAttempted: true, error: errMsg };
  } catch (e) {
    const errMsg = `Twilio request exception: ${e instanceof Error ? e.message : String(e)}`;
    console.error("[alert]", errMsg);
    console.log("\n===== 🏠 ALERT (console fallback — Twilio exception) =====\n" + message + "\n=======================================\n");
    return { channel: "console", status: "SENT", twilioAttempted: true, error: errMsg };
  }
}

// ---------------------------------------------------------------------------
// Pure alert-lifecycle decision — no I/O, fully unit-testable.
// ---------------------------------------------------------------------------
export type AlertAction = "NEW_MATCH" | "PRICE_DROP" | "MATERIAL_CHANGE" | "SUPPRESSED" | "NONE";

export interface AlertDecisionInput {
  scoreQualifies: boolean; // score >= profile.whatsappThreshold
  isDuplicate: boolean; // listing.isDuplicateOf != null
  alreadyAlertedBefore: boolean; // match.lastAlertedPrice != null
  lastAlertedPrice: number | null;
  currentPrice: number | null;
  priceDropReAlert: boolean; // profile setting; also gates material-change re-alert
  lastAlertedSnapshot: string | null;
  currentSnapshot: string;
}

/**
 * Decides what (if anything) to alert for a single (profile, listing) pair.
 * Priority when re-alerting: PRICE_DROP > MATERIAL_CHANGE > SUPPRESSED.
 */
export function decideAlertAction(input: AlertDecisionInput): AlertAction {
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
  if (input.priceDropReAlert && input.lastAlertedSnapshot != null && input.lastAlertedSnapshot !== input.currentSnapshot) {
    return "MATERIAL_CHANGE";
  }
  return "SUPPRESSED";
}

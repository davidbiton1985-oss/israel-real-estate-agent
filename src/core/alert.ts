// WhatsApp alert via Twilio REST API (plain fetch, no SDK). Console fallback if not configured.
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

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM &&
      process.env.ALERT_WHATSAPP_TO
  );
}

/** Sends via WhatsApp if Twilio env is configured, otherwise logs to console. Returns the channel used. */
export async function sendAlert(message: string): Promise<{ channel: "whatsapp" | "console"; ok: boolean; error?: string }> {
  if (twilioConfigured()) {
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
      if (res.ok) return { channel: "whatsapp", ok: true };
      const err = await res.text();
      console.error("[alert] Twilio failed, falling back to console:", err);
      console.log("\n===== 🏠 ALERT (console fallback) =====\n" + message + "\n=======================================\n");
      return { channel: "console", ok: true, error: `Twilio error: ${err.slice(0, 200)}` };
    } catch (e) {
      console.error("[alert] Twilio exception, falling back to console:", e);
      console.log("\n===== 🏠 ALERT (console fallback) =====\n" + message + "\n=======================================\n");
      return { channel: "console", ok: true, error: String(e) };
    }
  }
  console.log("\n===== 🏠 ALERT (console — Twilio not configured) =====\n" + message + "\n======================================================\n");
  return { channel: "console", ok: true };
}

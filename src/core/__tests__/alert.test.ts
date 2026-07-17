import { describe, it, expect } from "vitest";
import { decideAlertAction, twilioConfigVars, sendAlert, buildAlertMessage, type AlertDecisionInput } from "../alert";
import type { Listing } from "@prisma/client";

const BASE: AlertDecisionInput = {
  scoreQualifies: true,
  isDuplicate: false,
  userDismissed: false,
  alreadyAlertedBefore: false,
  lastAlertedPrice: null,
  currentPrice: 7000,
  priceDropReAlert: true,
  lastAlertedSnapshot: null,
  currentSnapshot: "{}",
};

describe("decideAlertAction — alert lifecycle rules", () => {
  it("score below threshold → NONE", () => {
    expect(decideAlertAction({ ...BASE, scoreQualifies: false })).toBe("NONE");
  });

  it("user-dismissed listing → NONE, even on a price drop", () => {
    const r = decideAlertAction({
      ...BASE,
      userDismissed: true,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 8000,
      currentPrice: 7000, // a drop that would normally re-alert
      lastAlertedSnapshot: "{}",
    });
    expect(r).toBe("NONE");
  });

  it("duplicate → SUPPRESSED (never NEW_MATCH, even if never alerted before)", () => {
    expect(decideAlertAction({ ...BASE, isDuplicate: true })).toBe("SUPPRESSED");
  });

  it("first qualifying sighting → NEW_MATCH", () => {
    expect(decideAlertAction(BASE)).toBe("NEW_MATCH");
  });

  it("same listing, same price, same snapshot, already alerted → SUPPRESSED (no duplicate re-alert)", () => {
    const r = decideAlertAction({ ...BASE, alreadyAlertedBefore: true, lastAlertedPrice: 7000, lastAlertedSnapshot: "{}" });
    expect(r).toBe("SUPPRESSED");
  });

  it("PRICE-LESS listing already alerted → SUPPRESSED (regression: re-alerted 200×/post when the pipeline derived 'already alerted' from lastAlertedPrice != null)", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true, // must come from match.alerted, not lastAlertedPrice
      lastAlertedPrice: null,
      currentPrice: null,
      lastAlertedSnapshot: "{}",
    });
    expect(r).toBe("SUPPRESSED");
  });

  it("lower price than last alert → PRICE_DROP", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 7200,
      currentPrice: 6900,
      lastAlertedSnapshot: "{}",
    });
    expect(r).toBe("PRICE_DROP");
  });

  it("higher price than last alert → no price-drop alert (SUPPRESSED)", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 6900,
      currentPrice: 7200,
      lastAlertedSnapshot: "{}",
    });
    expect(r).toBe("SUPPRESSED");
  });

  it("priceDropReAlert=false → price drop is not re-alerted", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 7200,
      currentPrice: 6900,
      priceDropReAlert: false,
      lastAlertedSnapshot: "{}",
    });
    expect(r).toBe("SUPPRESSED");
  });

  it("known→unknown flip is extraction noise, NOT a material change (regression: 'חניה: כן ← לא ידוע' alerted)", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 7000,
      lastAlertedSnapshot: JSON.stringify({ rooms: 4, parking: true, balcony: null }),
      currentSnapshot: JSON.stringify({ rooms: 4, parking: null, balcony: true }),
    });
    expect(r).toBe("SUPPRESSED");
  });

  it("value→different-value between two KNOWN values still fires MATERIAL_CHANGE", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 7000,
      lastAlertedSnapshot: JSON.stringify({ rooms: 4, parking: true }),
      currentSnapshot: JSON.stringify({ rooms: 5, parking: true }),
    });
    expect(r).toBe("MATERIAL_CHANGE");
  });

  it("material change (snapshot differs) with unchanged price → MATERIAL_CHANGE", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 7000,
      lastAlertedSnapshot: '{"rooms":4}',
      currentSnapshot: '{"rooms":3}',
    });
    expect(r).toBe("MATERIAL_CHANGE");
  });

  it("price drop takes priority over a simultaneous material change", () => {
    const r = decideAlertAction({
      ...BASE,
      alreadyAlertedBefore: true,
      lastAlertedPrice: 7200,
      currentPrice: 6900,
      lastAlertedSnapshot: '{"rooms":4}',
      currentSnapshot: '{"rooms":3}',
    });
    expect(r).toBe("PRICE_DROP");
  });
});

describe("buildAlertMessage — Hebrew: original post + link, not an English parse", () => {
  const HEB_POST = 'להשכרה בהרצליה, 3 חדרים, משופצת, 5,500 ש"ח, ללא תיווך, מבעל הבית. 0501234567';
  const listing = {
    city: "Herzliya",
    rooms: 3,
    price: 5500,
    brokerStatus: "PRIVATE",
    rawText: HEB_POST,
    url: "https://facebook.com/groups/x/posts/123",
  } as unknown as Listing;

  it("includes the verbatim Hebrew post and the direct link", () => {
    const msg = buildAlertMessage(listing);
    expect(msg).toContain(HEB_POST);
    expect(msg).toContain("https://facebook.com/groups/x/posts/123");
  });

  it("uses a Hebrew summary line and drops the old English field dump", () => {
    const msg = buildAlertMessage(listing);
    expect(msg).toContain("הרצליה"); // city rendered in Hebrew
    expect(msg).toContain("3 חד'");
    expect(msg).toContain("5,500 ₪");
    expect(msg).toContain("פרטי"); // "private" in Hebrew
    expect(msg).not.toContain("New real-estate match");
    expect(msg).not.toMatch(/Type:|Area:|Rooms:|Broker:|Recommended action:/);
  });
});

describe("Twilio configuration + safe fallback", () => {
  // Clear ALL channel vars so tests are hermetic regardless of the host env.
  const ALL_VARS = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_WHATSAPP_FROM",
    "ALERT_WHATSAPP_TO",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID",
  ] as const;

  function clearTwilioEnv(): Record<string, string | undefined> {
    const saved: Record<string, string | undefined> = {};
    for (const k of ALL_VARS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    return saved;
  }
  function restoreEnv(saved: Record<string, string | undefined>) {
    for (const k of ALL_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  }

  it("reports exactly which vars are missing", () => {
    const saved = clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    const r = twilioConfigVars();
    expect(r.configured).toBe(false);
    expect(r.missing).toEqual(["TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "ALERT_WHATSAPP_TO"]);
    restoreEnv(saved);
  });

  it("sendAlert never throws and falls back to console when unconfigured", async () => {
    const saved = clearTwilioEnv();
    const result = await sendAlert("test message");
    expect(result.channel).toBe("console");
    expect(result.status).toBe("SENT");
    expect(result.twilioAttempted).toBe(false);
    expect(result.error).toContain("missing");
    restoreEnv(saved);
  });

  it("never includes the auth token value in the returned error", async () => {
    const saved = clearTwilioEnv();
    process.env.TWILIO_AUTH_TOKEN = "super-secret-token-value";
    const result = await sendAlert("test message");
    expect(JSON.stringify(result)).not.toContain("super-secret-token-value");
    restoreEnv(saved);
  });

  it("console fallback is FAILED (not SENT) when the user intends a real channel", async () => {
    // Partial Twilio config = the user INTENDS WhatsApp; console is NOT delivery.
    const saved = clearTwilioEnv();
    process.env.TWILIO_ACCOUNT_SID = "AC123"; // intends, but not configured
    const result = await sendAlert("test message");
    expect(result.channel).toBe("console");
    expect(result.status).toBe("FAILED");
    restoreEnv(saved);
  });
});

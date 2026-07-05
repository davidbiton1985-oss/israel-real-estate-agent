import { describe, it, expect } from "vitest";
import { decideAlertAction, twilioConfigVars, sendAlert, type AlertDecisionInput } from "../alert";

const BASE: AlertDecisionInput = {
  scoreQualifies: true,
  isDuplicate: false,
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

describe("Twilio configuration + safe fallback", () => {
  const ALL_VARS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "ALERT_WHATSAPP_TO"] as const;

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
});

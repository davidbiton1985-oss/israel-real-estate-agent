import { describe, it, expect } from "vitest";
import { htmlToText, extractListingUrl, senderToSource, emailToRawItem, senderAllowed, emailConfigVars } from "../connectors/email";
import { parseListing } from "../parser";

describe("email connector — pure helpers (no IMAP needed)", () => {
  describe("htmlToText", () => {
    it("strips tags, styles, and entities; keeps line structure", () => {
      const html =
        "<style>.x{color:red}</style><div>דירת 4 חדרים</div><p>7,200 &quot;ש&quot;ח</p><br><a href='https://x'>קישור</a>";
      const text = htmlToText(html);
      expect(text).toContain("דירת 4 חדרים");
      expect(text).toContain("7,200");
      expect(text).not.toContain("<div>");
      expect(text).not.toContain("color:red");
    });
  });

  describe("extractListingUrl", () => {
    it("finds a Yad2 item link inside email text", () => {
      const url = extractListingUrl("נכס חדש עבורך! https://www.yad2.co.il/realestate/item/abc123xy צפה עכשיו");
      expect(url).toBe("https://www.yad2.co.il/realestate/item/abc123xy");
    });
    it("prefers Yad2 over other links and returns null when no listing link", () => {
      expect(
        extractListingUrl("https://example.com/foo https://www.yad2.co.il/item/z9 more text")
      ).toContain("yad2.co.il");
      expect(extractListingUrl("שום קישור כאן")).toBeNull();
    });
  });

  describe("senderToSource", () => {
    it("maps Yad2 senders to the YAD2 source (so Yad2 dedup applies)", () => {
      expect(senderToSource('"יד2" <noreply@yad2.co.il>')).toBe("YAD2");
    });
    it("maps unknown senders to EMAIL", () => {
      expect(senderToSource("broker@example.com")).toBe("EMAIL");
    });
  });

  describe("senderAllowed", () => {
    it("empty allow-list accepts everyone", () => {
      expect(senderAllowed("anyone@example.com", "")).toBe(true);
      expect(senderAllowed("anyone@example.com", undefined)).toBe(true);
    });
    it("filters by substring match on the From header", () => {
      expect(senderAllowed('"יד2" <alerts@yad2.co.il>', "yad2, mybroker@x.com")).toBe(true);
      expect(senderAllowed("newsletter@spam.com", "yad2")).toBe(false);
    });
  });

  describe("emailToRawItem", () => {
    it("builds an ingestible item from a realistic Yad2-style alert email", () => {
      const body = [
        "נכס חדש שמתאים לחיפוש שלך!",
        'להשכרה בגני תקווה: דירת 4 חדרים, 100 מ"ר, מרפסת שמש, חניה, מעלית. ללא תיווך. 7,200 ש"ח.',
        "לצפייה בנכס: https://www.yad2.co.il/realestate/item/em41l1",
      ].join("\n");
      const item = emailToRawItem('"יד2" <noreply@yad2.co.il>', "נכס חדש בגני תקווה", body);
      expect(item).not.toBeNull();
      expect(item!.source).toBe("YAD2");
      expect(item!.url).toBe("https://www.yad2.co.il/realestate/item/em41l1");

      // and the existing parser extracts the real fields from it end-to-end:
      const parsed = parseListing(item!.rawText, item!.url);
      expect(parsed.city).toBe("Ganei Tikva");
      expect(parsed.price).toBe(7200);
      expect(parsed.rooms).toBe(4);
      expect(parsed.brokerStatus).toBe("PRIVATE");
      expect(parsed.yad2ListingId).toBe("em41l1"); // dedup key comes straight from the email link
    });

    it("rejects empty/stub emails", () => {
      expect(emailToRawItem("a@b.com", "hi", "  ")).toBeNull();
    });
  });

  describe("emailConfigVars", () => {
    it("reports missing IMAP vars without crashing", () => {
      const saved = { h: process.env.IMAP_HOST, u: process.env.IMAP_USER, p: process.env.IMAP_PASS };
      delete process.env.IMAP_HOST;
      delete process.env.IMAP_USER;
      delete process.env.IMAP_PASS;
      const r = emailConfigVars();
      expect(r.configured).toBe(false);
      expect(r.missing).toEqual(["IMAP_HOST", "IMAP_USER", "IMAP_PASS"]);
      if (saved.h) process.env.IMAP_HOST = saved.h;
      if (saved.u) process.env.IMAP_USER = saved.u;
      if (saved.p) process.env.IMAP_PASS = saved.p;
    });
  });
});

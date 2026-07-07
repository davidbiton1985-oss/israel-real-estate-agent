import { describe, it, expect } from "vitest";
import { listingCandidatesDetailed, listingCandidates, groupContext, extractListingFromPost } from "../bulkExtract";
import { parseListing } from "../parser";
import { scoreListing } from "../matching";
import type { Listing, Profile } from "@prisma/client";

// Mimics REAL harvested text from a city-specific Facebook rental group:
// group name (city + deal implied), our own badge pollution, Facebook nav
// chrome, city-less posts (short AND multi-line), and comments.
const REAL_BLOB = [
  "Number of unread notifications",
  "דירות להשכרה קריית אונו", // group name → Kiryat Ono + RENT
  "Public group",
  "20.4K members",
  "Invite",
  "Share",
  "Joined",
  "RE-Agent FBv10: scanning feed… step 5/25 · 1KB", // our badge — must be ignored
  "📩 Send selected apartment",
  "Oz Granit",
  "Follow",
  'דירת 4 חדרים משופצת, מרפסת שמש, חניה, 8,500 ש"ח, כניסה מיידית', // short offer, NO city
  "052-1234567",
  "All reactions",
  "Like",
  "Comment",
  "Dana Levi",
  "Follow",
  "פנטהאוז 5 חדרים בבניין בוטיק", // multi-line offer: rooms here…
  "משופץ, נוף פתוח, מעלית",
  "חניה כפולה ומחסן",
  'מחיר 8,900 ש"ח לחודש', // …price 3 lines later
  "050-9999999",
  "All reactions",
  "Like",
  "Comment",
  "שכונה? Reply", // comment
  "עדיין פנוי? Reply", // comment
].join("\n");

describe("bulkExtract — real Facebook group structure", () => {
  it("infers city + deal type from the group name", () => {
    expect(groupContext(REAL_BLOB)).toEqual({ city: "Kiryat Ono", dealType: "RENT" });
  });

  it("extracts both offers — including the city-less and the multi-line one", () => {
    const cands = listingCandidatesDetailed(REAL_BLOB);
    expect(cands.length).toBe(2);
    const parsed = cands.map((c) => parseListing(c.text));
    const short = parsed.find((p) => p.rooms === 4);
    expect(short?.city).toBe("Kiryat Ono"); // filled from the group
    expect(short?.price).toBe(8500);
    expect(short?.dealType).toBe("RENT");
    const multi = parsed.find((p) => p.rooms === 5);
    expect(multi?.price).toBe(8900); // stitched across lines
    expect(multi?.city).toBe("Kiryat Ono");
  });

  it("ignores badge pollution, nav chrome, and comments", () => {
    const joined = listingCandidates(REAL_BLOB).join(" || ");
    expect(joined).not.toContain("RE-Agent");
    expect(joined).not.toContain("members");
    expect(joined).not.toContain("שכונה");
  });

  it("pure chatter with no price+rooms yields nothing", () => {
    const chatter = "שכונה? Reply\nעדיין פנוי? Like Reply\nמישהו יודע? Share";
    expect(listingCandidates("דירות להשכרה קריית אונו\n" + chatter).length).toBe(0);
  });

  it("a lone price comment (no rooms) is not a listing", () => {
    expect(listingCandidates("דירות להשכרה קריית אונו\nCaryn 17,000 למי שתהה Reply").length).toBe(0);
  });

  it("end-to-end: an extracted candidate scores as a strong match", () => {
    const profile = {
      id: "p", name: "t", dealType: "RENT", cities: "Ganei Tikva, Kiryat Ono",
      neighborhoods: null, streets: null, priceMin: 7500, priceMax: 9500, roomsMin: 3, roomsMax: 5,
      sizeMinSqm: null, propertyType: null, entryBy: null, balcony: "PREFERRED", parking: "INDIFFERENT",
      elevator: "INDIFFERENT", mamad: "INDIFFERENT", brokerStatusPref: "any", brokerFeePref: "unknown_allowed",
      maxFeeIfKnown: null, whatsappThreshold: 80, dashboardThreshold: 60, priceDropReAlert: true,
      active: true, createdAt: new Date(),
    } as Profile;
    const cand = listingCandidatesDetailed(REAL_BLOB).find((c) => parseListing(c.text).rooms === 4)!;
    const p = parseListing(cand.text);
    const listing = { ...p, id: "l", source: "FACEBOOK", url: null, rawText: cand.text, isDuplicateOf: null } as unknown as Listing;
    expect(scoreListing(profile, listing).status).toBe("strong_match");
  });

  it("multi-city group → uses the first named city so city-less posts still match", () => {
    // "בקרית אונו ובגני תקווה" — both are target cities, so a city-less post
    // there should still be located (to the first named city), not dropped.
    const ctx = groupContext("דירות למכירה והשכרה בקרית אונו ובגני תקווה");
    expect(ctx.city).not.toBeNull();
    expect(["Ganei Tikva", "Kiryat Ono"]).toContain(ctx.city);
  });
});

describe("extractListingFromPost — one post, correct deal type, reject non-offers", () => {
  const ctx = { city: "Kiryat Ono" as string | null, dealType: "RENT" as "RENT" | "SALE" | null };
  it("rejects a roommate-wanted post", () => {
    expect(extractListingFromPost("מחפשת שותפה לדירת 4 שותפות\n1850₪", ctx)).toBeNull();
  });
  it("rejects a land/investment post", () => {
    expect(extractListingFromPost("3 חדרים. זה לא רק מגרש – זו השקעה. קרקע בקריית אונו", ctx)).toBeNull();
  });
  it("labels a ₪2.7M post as SALE (so a rent profile rejects it) — never a fake rent", () => {
    const c = extractListingFromPost("דירת 4 חדרים למכירה\nמחיר 2,700,000 שח\n050-1234567", ctx)!;
    expect(parseListing(c.text).dealType).toBe("SALE");
  });
  it("a monthly rent is RENT even with a long phone number present (no false SALE)", () => {
    const c = extractListingFromPost("דירת 4 חדרים משופצת\nמחיר 8,700 שח לחודש\n050-1111111", ctx)!;
    const p = parseListing(c.text);
    expect(p.dealType).toBe("RENT");
    expect(p.price).toBe(8700);
  });
  it("stitches a city-less multi-line rent and fills the city from the group", () => {
    const c = extractListingFromPost("פנטהאוז 3 חדרים\nמרפסת נוף\n8,200 שח לחודש\n0521234567", ctx)!;
    const p = parseListing(c.text);
    expect(p.dealType).toBe("RENT");
    expect(p.city).toBe("Kiryat Ono");
    expect(p.rooms).toBe(3);
    expect(p.price).toBe(8200);
  });
});

import { describe, it, expect } from "vitest";
import { splitIntoListings, listingCandidates } from "../bulkExtract";
import { parseListing } from "../parser";
import { scoreListing } from "../matching";
import type { Listing, Profile } from "@prisma/client";

// A realistic messy blob: two real apartment listings buried among comments,
// UI chrome, and off-topic chatter — like what the watcher harvests off a
// Facebook group page.
const BLOB = [
  "Groups | Facebook",
  "Anonymous member 807 · 2h · Like Reply",
  "Orly Yeffet Valdman שכונה? 2h Like Reply Share",
  'להשכרה בקרית אונו! דירת 4 חדרים משופצת, 100 מ"ר, מרפסת שמש, חניה, מעלית, ממ"ד. ללא תיווך. 8,900 ש"ח לחודש. כניסה מיידית.',
  "Shir Sayag היי, ביום חמישי אני יכול לבוא לראות את הדירה? Reply",
  "Caryn Meiras 17,000 למי שתהה 4d Like Reply Share 1",
  "באיזה חודש? Reply",
  'למכירה בגני תקווה, דירת 5 חדרים, 120 מ"ר, קומה 3, מרפסת, חניה כפולה, מעלית, ממ"ד. 2.7 מיליון ש"ח. גמיש.',
  "Linoy Elbaz Magen איזה רחוב זה? 2m Like Reply Share",
  "See more Write a comment",
].join("\n");

describe("bulkExtract — find listings in a text blob (automatic Facebook path)", () => {
  it("splits the blob at rent/sale anchors", () => {
    const chunks = splitIntoListings(BLOB);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("returns exactly the 2 real apartment listings, not the comments/chatter", () => {
    const candidates = listingCandidates(BLOB);
    expect(candidates.length).toBe(2);
    const joined = candidates.join(" || ");
    expect(joined).toContain("קרית אונו");
    expect(joined).toContain("גני תקווה");
    // comment noise must NOT become its own candidate
    expect(candidates.some((c) => c.trim().startsWith("באיזה חודש"))).toBe(false);
  });

  it("each candidate parses to a real listing with the right fields", () => {
    const candidates = listingCandidates(BLOB);
    const parsed = candidates.map((c) => parseListing(c));
    const kiryatOno = parsed.find((p) => p.city === "Kiryat Ono");
    expect(kiryatOno).toBeTruthy();
    expect(kiryatOno!.price).toBe(8900);
    expect(kiryatOno!.rooms).toBe(4);
    expect(kiryatOno!.dealType).toBe("RENT");
    expect(kiryatOno!.brokerStatus).toBe("PRIVATE");

    const ganeiTikva = parsed.find((p) => p.city === "Ganei Tikva");
    expect(ganeiTikva!.price).toBe(2700000);
    expect(ganeiTikva!.rooms).toBe(5);
    expect(ganeiTikva!.dealType).toBe("SALE");
  });

  it("a blob with no listings (pure chatter) yields no candidates", () => {
    const chatter = "שכונה? Reply\nבאיזה חודש? Like Reply\nמישהו יודע? Share\nתודה רבה!";
    expect(listingCandidates(chatter).length).toBe(0);
  });

  it("catches listings that OMIT the rent word (city + rooms + price only)", () => {
    // real posts often skip 'להשכרה' — the group context implies it
    const blob = [
      "שכונה? Reply",
      'בגני תקווה דירת 4 חדרים, קומה 2, מרפסת שמש, חניה, 8,500 ש"ח, כניסה מיידית',
      "17,000 למי שתהה Like Reply",
      'קרית אונו, 3 חדרים משופצת, מרפסת, 8200 שח, גמיש',
      "באיזה חודש? Reply",
    ].join("\n");
    const candidates = listingCandidates(blob);
    expect(candidates.length).toBe(2);
    const parsed = candidates.map((c) => parseListing(c));
    expect(parsed.find((p) => p.city === "Ganei Tikva")?.price).toBe(8500);
    expect(parsed.find((p) => p.city === "Kiryat Ono")?.rooms).toBe(3);
  });

  it("a lone price in a comment (only one signal) is NOT a listing", () => {
    expect(listingCandidates("Caryn Meiras 17,000 למי שתהה Like Reply").length).toBe(0);
  });

  it("dedupes the same listing appearing twice (repeated across scroll snapshots)", () => {
    const doubled = BLOB + "\n\n" + BLOB;
    expect(listingCandidates(doubled).length).toBe(2);
  });

  it("end-to-end: the Kiryat Ono candidate scores as a strong match for the rent profile", () => {
    const profile = {
      id: "p", name: "t", dealType: "RENT", cities: "Ganei Tikva, Kiryat Ono",
      neighborhoods: null, streets: null, priceMin: 7500, priceMax: 9500, roomsMin: 3, roomsMax: 5,
      sizeMinSqm: null, propertyType: null, entryBy: null, balcony: "PREFERRED", parking: "INDIFFERENT",
      elevator: "INDIFFERENT", mamad: "INDIFFERENT", brokerStatusPref: "any", brokerFeePref: "unknown_allowed",
      maxFeeIfKnown: null, whatsappThreshold: 80, dashboardThreshold: 60, priceDropReAlert: true,
      active: true, createdAt: new Date(),
    } as Profile;
    const candidates = listingCandidates(BLOB);
    const koText = candidates.find((c) => c.includes("קרית אונו"))!;
    const p = parseListing(koText);
    const listing = { ...p, id: "l", source: "FACEBOOK", url: null, rawText: koText, isDuplicateOf: null } as unknown as Listing;
    const r = scoreListing(profile, listing);
    expect(r.status).toBe("strong_match");
  });
});

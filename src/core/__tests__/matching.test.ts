import { describe, it, expect } from "vitest";
import type { Listing, Profile } from "@prisma/client";
import { scoreListing, neighborhoodRules, neighborhoodAllowed } from "../matching";
import { parseListing } from "../parser";
import { fingerprint } from "../dedup";

// ---- factories -------------------------------------------------------------
function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    name: "test profile",
    dealType: "RENT",
    cities: "Ganei Tikva, Kiryat Ono, Petah Tikva",
    neighborhoods: null,
    streets: null,
    priceMin: null,
    priceMax: 7500,
    roomsMin: 4,
    roomsMax: 5,
    sizeMinSqm: null,
    propertyType: null,
    entryBy: null,
    balcony: "REQUIRED",
    parking: "PREFERRED",
    elevator: "INDIFFERENT",
    mamad: "INDIFFERENT",
    brokerStatusPref: "private_preferred_broker_allowed_if_strong_match",
    brokerFeePref: "unknown_allowed",
    maxFeeIfKnown: null,
    whatsappThreshold: 80,
    dashboardThreshold: 60,
    priceDropReAlert: true,
    active: true,
    createdAt: new Date(),
    ...overrides,
  } as Profile;
}

function makeListing(rawText: string, overrides: Partial<Listing> = {}): Listing {
  const p = parseListing(rawText, (overrides.url as string) ?? null);
  return {
    id: "l1",
    source: "MANUAL",
    url: null,
    yad2ListingId: p.yad2ListingId,
    rawText,
    dealType: p.dealType,
    city: p.city,
    neighborhood: p.neighborhood,
    street: p.street,
    price: p.price,
    rooms: p.rooms,
    sizeSqm: p.sizeSqm,
    floor: p.floor,
    totalFloors: p.totalFloors,
    balcony: p.balcony,
    parking: p.parking,
    elevator: p.elevator,
    mamad: p.mamad,
    storage: p.storage,
    garden: p.garden,
    condition: p.condition,
    furnished: p.furnished,
    propertyType: p.propertyType,
    entryImmediate: p.entryImmediate,
    entryFlexible: p.entryFlexible,
    entryDate: p.entryDate,
    arnonaMonthly: p.arnonaMonthly,
    vaadMonthly: p.vaadMonthly,
    brokerStatus: p.brokerStatus,
    brokerConfidence: p.brokerConfidence,
    brokerEvidence: p.brokerEvidence,
    brokerFeeStatus: p.brokerFeeStatus,
    brokerFeeText: p.brokerFeeText,
    fingerprint: "fp",
    isDuplicateOf: null,
    scanned: false,
    createdAt: new Date(),
    ...overrides,
  } as Listing;
}

const STRONG_TEXT =
  'להשכרה בגני תקווה! דירת 4 חדרים משופצת, 100 מ"ר, מרפסת שמש, חניה, קומה 2 מתוך 4 עם מעלית. ללא תיווך. 7,200 ש"ח. כניסה מיידית';

// ---- broker rules ----------------------------------------------------------
describe("brokerage matching rules", () => {
  it("private_only + clear broker → rejected", () => {
    const r = scoreListing(
      makeProfile({ brokerStatusPref: "private_only" }),
      makeListing('להשכרה בגני תקווה דירת 4 חדרים, מרפסת, משרד תיווך. 7,000 ש"ח')
    );
    expect(r.status).toBe("rejected");
    expect(r.score).toBe(0);
  });

  it("broker_only + clear private → rejected", () => {
    const r = scoreListing(makeProfile({ brokerStatusPref: "broker_only" }), makeListing(STRONG_TEXT));
    expect(r.status).toBe("rejected");
  });

  it("private_only + unknown broker → possible_match with missing field", () => {
    const r = scoreListing(
      makeProfile({ brokerStatusPref: "private_only" }),
      makeListing('להשכרה בגני תקווה דירת 4 חדרים, מרפסת, חניה, מעלית. 7,000 ש"ח')
    );
    expect(r.status).toBe("possible_match");
    expect(r.missingFields).toContain("סטטוס תיווך");
  });

  it("private_preferred + broker listing → penalty, not reject", () => {
    const r = scoreListing(
      makeProfile(),
      makeListing('להשכרה בגני תקווה דירת 4 חדרים, מרפסת שמש, חניה, מעלית. משרד תיווך, דמי תיווך חודש. 7,000 ש"ח')
    );
    expect(r.status).not.toBe("rejected");
    expect(r.score).toBeGreaterThanOrEqual(60);
  });

  it("no_fee_only + fee exists → rejected", () => {
    const r = scoreListing(
      makeProfile({ brokerFeePref: "no_fee_only" }),
      makeListing('להשכרה בגני תקווה 4 חדרים, מרפסת. דמי תיווך: חודש שכירות. 7,000 ש"ח')
    );
    expect(r.status).toBe("rejected");
  });
});

// ---- price rules -----------------------------------------------------------
describe("price rules", () => {
  it("price >5% over max → rejected", () => {
    const r = scoreListing(makeProfile(), makeListing('להשכרה בגני תקווה 4 חדרים, מרפסת. 9,500 ש"ח'));
    expect(r.status).toBe("rejected");
  });

  it("price ≤5% over max → possible_match with reason, never strong", () => {
    // 7,700 ≤ 7,500 * 1.05 = 7,875
    const r = scoreListing(makeProfile(), makeListing(STRONG_TEXT.replace("7,200", "7,700")));
    expect(r.status).toBe("possible_match");
    expect(r.reasonsNegative.join(" ")).toContain("מעט מעל התקציב");
  });

  it("known price clearly below priceMin → rejected (a range is a hard filter)", () => {
    // profile 7,500–9,500; a ₪4,500 listing must not alert
    const r = scoreListing(
      makeProfile({ priceMin: 7500, priceMax: 9500 }),
      makeListing('להשכרה בגני תקווה דירת 4 חדרים, מרפסת, חניה, מעלית. 4,500 ש"ח')
    );
    expect(r.status).toBe("rejected");
    expect(r.reasonsNegative.join(" ")).toContain("מתחת למינימום");
  });

  it("no priceMin set → cheap listing is not rejected on price", () => {
    const r = scoreListing(
      makeProfile({ priceMin: null, priceMax: 9500 }),
      makeListing('להשכרה בגני תקווה דירת 4 חדרים, מרפסת, חניה, מעלית. 4,500 ש"ח')
    );
    expect(r.status).not.toBe("rejected");
  });
});

// ---- not-a-listing guard ---------------------------------------------------
describe("not-a-listing guard (Facebook group chatter)", () => {
  it("post with no city/price/rooms/size → rejected, not a possible match", () => {
    const r = scoreListing(makeProfile(), makeListing("ההורים של הילדים בגנים לא תושבים? מישהו יודע?"));
    expect(r.status).toBe("rejected");
    expect(r.reasonsNegative.join(" ")).toContain("כנראה לא מודעה");
  });

  it("post with even one real signal (a target city) is NOT rejected by the guard", () => {
    const r = scoreListing(makeProfile(), makeListing("דירה בגני תקווה, פרטים בפרטי"));
    expect(r.status).not.toBe("rejected");
  });
});

// ---- rooms rules -----------------------------------------------------------
describe("rooms rules", () => {
  it("known rooms clearly below range → rejected (4–5 profile, 3-room listing)", () => {
    const r = scoreListing(
      makeProfile({ roomsMin: 4, roomsMax: 5 }),
      makeListing('להשכרה בקרית אונו דירת 3 חדרים, מרפסת, חניה, מעלית. 7,000 ש"ח')
    );
    expect(r.status).toBe("rejected");
    expect(r.reasonsNegative.join(" ")).toContain("מחוץ לטווח");
  });

  it("rooms within ±0.5 tolerance → still scores, not rejected (3.5 for a 4–5 search)", () => {
    const r = scoreListing(
      makeProfile({ roomsMin: 4, roomsMax: 5 }),
      makeListing('להשכרה בקרית אונו דירת 3.5 חדרים, מרפסת, חניה, מעלית. 7,000 ש"ח')
    );
    expect(r.status).not.toBe("rejected");
  });

  it("rooms in range → not rejected on rooms", () => {
    const r = scoreListing(
      makeProfile({ roomsMin: 4, roomsMax: 5 }),
      makeListing('להשכרה בקרית אונו דירת 5 חדרים, מרפסת, חניה, מעלית. 7,000 ש"ח')
    );
    expect(r.status).not.toBe("rejected");
  });

  it("unknown rooms → not rejected (missing ≠ reject)", () => {
    const r = scoreListing(
      makeProfile({ roomsMin: 4, roomsMax: 5 }),
      makeListing('להשכרה בקרית אונו דירה יפה, מרפסת, חניה, מעלית. 7,000 ש"ח')
    );
    expect(r.status).not.toBe("rejected");
  });
});

// ---- location rules ----------------------------------------------------------
describe("location rules", () => {
  it("wrong city → rejected", () => {
    const r = scoreListing(makeProfile(), makeListing('להשכרה בהרצליה דירת 4 חדרים, מרפסת. 7,000 ש"ח'));
    expect(r.status).toBe("rejected");
  });

  it("missing city → possible at best, with missing field", () => {
    const r = scoreListing(makeProfile(), makeListing('להשכרה! דירת 4 חדרים, מרפסת שמש, חניה, מעלית, ללא תיווך. 7,000 ש"ח'));
    expect(r.status).toBe("possible_match");
    expect(r.missingFields).toContain("עיר/מיקום");
  });

  it("missing city on a locations-FILTERED Yad2 capture → NOT capped", () => {
    // Regression: a ₪8,600 in-budget 4-room was silenced at 79 because Yad2's
    // card omitted the city line; the user's own search filters guarantee city.
    const text = 'נדל"ן להשכרה במיקומים שנבחרו | אלפי מודעות חדשות בכל יום\nלהשכרה! דירת 4 חדרים, מרפסת שמש, חניה, מעלית, ללא תיווך. 8,600 ש"ח';
    const r = scoreListing(makeProfile({ priceMax: 9500 }), makeListing(text, { source: "YAD2" }));
    expect(r.status).toBe("strong_match");
    expect(r.missingFields).toContain("עיר/מיקום");
  });

  it("missing city on a REGION-page Yad2 capture → still capped (can be any town)", () => {
    // A Tel Mond listing from a "מרכז והשרון" region page must not become a
    // strong match just because its town isn't in the parser's city list.
    const text = 'נדל"ן להשכרה במרכז והשרון | אלפי מודעות חדשות בכל יום\nלהשכרה! דירת 4 חדרים, מרפסת שמש, חניה, מעלית, ללא תיווך. 8,600 ש"ח';
    const r = scoreListing(makeProfile({ priceMax: 9500 }), makeListing(text, { source: "YAD2" }));
    expect(r.status).toBe("possible_match");
  });
});

describe("per-city neighborhood restrictions (e.g. only גליל ים within Herzliya)", () => {
  const profile = () => makeProfile({ cities: "Ganei Tikva, Kiryat Ono, Herzliya", neighborhoods: "הרצליה: גליל ים", priceMax: 9500 });

  it("Herzliya post IN Galil Yam (plain 'בגליל ים' text) → passes and is credited", () => {
    const r = scoreListing(profile(), makeListing('להשכרה בהרצליה בגליל ים דירת 4 חדרים, מרפסת, 8,600 ש"ח'));
    expect(r.status).not.toBe("rejected");
    expect(r.reasonsPositive.join(" ")).toContain("גליל ים");
  });

  it("dash spelling 'גליל-ים' also matches", () => {
    const r = scoreListing(profile(), makeListing('להשכרה בהרצליה בגליל-ים דירת 4 חדרים, מרפסת, 8,600 ש"ח'));
    expect(r.status).not.toBe("rejected");
  });

  it("Herzliya post NOT in Galil Yam → rejected with the restriction named", () => {
    const r = scoreListing(profile(), makeListing('להשכרה בהרצליה בנווה עמל דירת 4 חדרים, מרפסת, 8,600 ש"ח'));
    expect(r.status).toBe("rejected");
    expect(r.reasonsNegative.join(" ")).toContain("גליל ים");
  });

  it("unrestricted city (Ganei Tikva) is untouched by the Herzliya rule", () => {
    const r = scoreListing(profile(), makeListing('להשכרה בגני תקווה דירת 4 חדרים, מרפסת, 8,600 ש"ח'));
    expect(r.status).not.toBe("rejected");
  });

  it("rules parse city aliases: 'הרצליה: גליל ים' scopes canonical Herzliya", () => {
    const rules = neighborhoodRules("הרצליה: גליל ים");
    expect(rules.get("Herzliya")).toEqual(["גליל ים"]);
    expect(neighborhoodAllowed(rules, "Herzliya", null, "דירה בגליל ים").allowed).toBe(true);
    expect(neighborhoodAllowed(rules, "Herzliya", null, "דירה בהרצליה פיתוח").allowed).toBe(false);
    expect(neighborhoodAllowed(rules, "Kiryat Ono", null, "דירה").allowed).toBe(true);
  });
});

// ---- feature rules -----------------------------------------------------------
describe("required feature rules", () => {
  it("required balcony explicitly absent → rejected", () => {
    const r = scoreListing(makeProfile(), makeListing('להשכרה בגני תקווה 4 חדרים, אין מרפסת. ללא תיווך. 7,000 ש"ח'));
    expect(r.status).toBe("rejected");
  });

  it("required balcony unknown → possible_match with missing field", () => {
    const r = scoreListing(makeProfile(), makeListing('להשכרה בגני תקווה 4 חדרים, חניה, מעלית. ללא תיווך. 7,000 ש"ח'));
    expect(r.status).toBe("possible_match");
    expect(r.missingFields).toContain("מרפסת");
  });
});

// ---- full realistic listing ---------------------------------------------------
describe("full realistic Hebrew listing", () => {
  it("parses and scores as a strong match with alert-worthy score", () => {
    const listing = makeListing(STRONG_TEXT);
    expect(listing.city).toBe("Ganei Tikva");
    expect(listing.price).toBe(7200);
    expect(listing.rooms).toBe(4);
    expect(listing.sizeSqm).toBe(100);
    expect(listing.floor).toBe(2);
    expect(listing.totalFloors).toBe(4);
    expect(listing.balcony).toBe(true);
    expect(listing.brokerStatus).toBe("PRIVATE");

    const r = scoreListing(makeProfile(), listing);
    expect(r.status).toBe("strong_match");
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.recommendedAction).toContain("התקשר עכשיו");
  });

  it("duplicate listing is capped at possible and flagged", () => {
    const r = scoreListing(makeProfile(), makeListing(STRONG_TEXT, { isDuplicateOf: "other-id" }));
    expect(r.status).toBe("possible_match");
    expect(r.redFlags.join(" ")).toContain("כפילות");
  });
});

// ---- dedup -------------------------------------------------------------------
describe("dedup fingerprints", () => {
  it("same Yad2 ID → same fingerprint regardless of text", () => {
    const url = "https://www.yad2.co.il/realestate/item/demo1abc";
    const a = fingerprint(parseListing("טקסט אחד", url), "טקסט אחד", url);
    const b = fingerprint(parseListing("טקסט אחר לגמרי", url), "טקסט אחר לגמרי", url);
    expect(a).toBe(b);
    expect(a).toBe("yad2:demo1abc");
  });

  it("different content, no url → different fingerprints", () => {
    const t1 = 'דירת 4 חדרים בגני תקווה 7,200 ש"ח';
    const t2 = 'דירת 3 חדרים ברמת גן 5,500 ש"ח';
    expect(fingerprint(parseListing(t1), t1, null)).not.toBe(fingerprint(parseListing(t2), t2, null));
  });
});

// ---- entry-date matching -------------------------------------------------------
describe("entry-date matching", () => {
  const BASE = 'להשכרה בגני תקווה! דירת 4 חדרים משופצת, 100 מ"ר, מרפסת שמש, חניה, קומה 2 מתוך 4 עם מעלית. ללא תיווך. 7,200 ש"ח.';

  it("profile with no entryBy → entry date has no effect on reasons", () => {
    const r = scoreListing(makeProfile({ entryBy: null }), makeListing(BASE + " כניסה מיידית."));
    expect(r.reasonsPositive.join(" ")).not.toContain("תאריך כניסה");
    expect(r.missingFields).not.toContain("תאריך כניסה");
  });

  it("listing says מיידי + profile has entryBy → compatible", () => {
    const r = scoreListing(makeProfile({ entryBy: "2026-09-01" }), makeListing(BASE + " כניסה מיידית."));
    expect(r.reasonsPositive.join(" ")).toContain("תאריך כניסה מתאים (מיידי/גמיש)");
  });

  it("listing entry date at/before profile's entryBy → compatible", () => {
    const r = scoreListing(makeProfile({ entryBy: "2026-09-01" }), makeListing(BASE + " כניסה ב-1.9.2026."));
    expect(r.reasonsPositive.join(" ")).toContain("תאריך כניסה מתאים");
  });

  it("listing entry date clearly later than profile's entryBy → penalty + capped, never rejected outright", () => {
    const r = scoreListing(makeProfile({ entryBy: "2026-09-01" }), makeListing(BASE + " כניסה ב-1.12.2026."));
    expect(r.reasonsNegative.join(" ")).toContain("תאריך הכניסה אולי מאוחר מדי");
    expect(r.status).not.toBe("strong_match");
    expect(r.status).not.toBe("rejected"); // soft penalty only, not a hard reject
  });

  it("listing has no entry-date info at all + profile has entryBy → missing field, not a rejection", () => {
    const r = scoreListing(makeProfile({ entryBy: "2026-09-01" }), makeListing(BASE));
    expect(r.missingFields).toContain("תאריך כניסה");
    expect(r.status).not.toBe("rejected");
  });
});

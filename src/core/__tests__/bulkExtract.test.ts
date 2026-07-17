import { describe, it, expect } from "vitest";
import { listingCandidatesDetailed, listingCandidates, groupContext, extractListingFromPost, isNotAnOffer } from "../bulkExtract";
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
  it("purchase-speak (לרכוש) without a price is SALE — never inherits the group's RENT", () => {
    // real bug: "הזדמנות לרכוש… בית בפארק" in a rentals group got stamped
    // "להשכרה" and alerted at score 87
    const c = extractListingFromPost("הזדמנות לרכוש דירת 3 חדרים בפרויקט המבוקש\n78 מ״ר בנוי + מרפסת שמש", ctx)!;
    expect(c.dealType).toBe("SALE");
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

describe("rejects 'looking for' (wanted) posts on the FEED/BULK path too", () => {
  // The exact false-alert shape: a city-specific rental group whose TITLE says
  // "for rent", with a post from someone SEARCHING (מחפשת) — must yield nothing.
  const WANTED = [
    "דירות להשכרה בהרצליה בלבד", // group title → Herzliya + RENT (inherited by posts)
    "Public group",
    "67.4K members",
    "Sara Bi",
    "מחפשת דירת 3 חדרים בהרצליה והאזור באזור 4,500 ₪", // a SEARCHER, not an offer
    "Like",
    "Comment",
  ].join("\n");

  it("a wanted post with rooms+budget yields NO listing (was the false WhatsApp alert)", () => {
    expect(listingCandidates(WANTED).length).toBe(0);
  });

  it("keeps a real offer but drops the wanted post in the same feed", () => {
    const blob = WANTED + "\n" + ['דירת 3 חדרים משופצת, מרפסת, חניה, 5,500 ש"ח, כניסה מיידית', "052-1234567"].join("\n");
    const cands = listingCandidatesDetailed(blob);
    expect(cands.length).toBe(1);
    expect(cands[0].text).not.toContain("מחפשת");
    expect(parseListing(cands[0].text).price).toBe(5500);
  });

  it("isNotAnOffer catches varied 'looking for' phrasings without rejecting real offers", () => {
    expect(isNotAnOffer("מחפשת דירת 3 חדרים בהרצליה")).toBe(true);
    expect(isNotAnOffer("מחפש/ת דירה בהרצליה")).toBe(true);
    expect(isNotAnOffer("זוג צעיר מחפשים דירת 3 חדרים")).toBe(true);
    expect(isNotAnOffer("מעוניינת לשכור דירה")).toBe(true);
    // "מעוניין להשכיר" is a landlord OFFERING — must NOT be treated as wanted
    expect(isNotAnOffer("בעל דירה מעוניין להשכיר דירת 3 חדרים")).toBe(false);
    expect(isNotAnOffer('דירת 4 חדרים להשכרה, משופצת, 6,000 ש"ח')).toBe(false);
  });
});

describe("sublets / temporary rentals are not offers", () => {
  const ctx = { city: "Kiryat Ono" as string | null, dealType: "RENT" as "RENT" | "SALE" | null };
  it.each([
    "סאבלט דירת 3 חדרים במרכז קרית אונו לחודשיים",
    "סבלט! 4 חדרים מרוהטת",
    "השכרת משנה דירת 4 חדרים",
    "להשכרה לספט׳ דירת פנטהאוס 5 חדרים עם 100 מ מרפסת", // real specimen (user: sublet)
    "להשכרה ליולי-אוגוסט דירת 4 חדרים",
    "להשכרה לחודש בלבד 3 חדרים",
  ])("%s → filtered", (text) => {
    expect(extractListingFromPost(text, ctx)).toBeNull();
  });
  it("a normal rental with a September ENTRY date is still an offer", () => {
    const c = extractListingFromPost('להשכרה דירת 4 חדרים, כניסה בספטמבר, 8,000 ש"ח', ctx);
    expect(c).not.toBeNull();
  });
});

describe("letter-spaced Hebrew cannot evade detection", () => {
  const ctx = { city: "Kiryat Ono" as string | null, dealType: "RENT" as "RENT" | "SALE" | null };
  it("the real 'ל מ כ י ר ה' sale post is labeled SALE, not the group's RENT (regression: it WhatsApp-alerted as a rental)", () => {
    const real = "להשכרה ברחוב הזמיר המבוקש.\nבפרוייקט ״נופי רייספלד״ , קרית אונו.\nזו לא דירה רגילה זו דירה וואו\nל מ כ י ר ה :\nדירת 4 חדרים מוארת ומרווחת";
    const c = extractListingFromPost(real, ctx)!;
    expect(c.dealType).toBe("SALE");
  });
  it("letter-spaced מ ח פ ש ת cannot evade the wanted-post filter", () => {
    expect(extractListingFromPost("מ ח פ ש ת דירת 3 חדרים בקרית אונו", ctx)).toBeNull();
  });
});

describe("Facebook: price optional (rooms required)", () => {
  const ctx = { city: "Kiryat Ono" as string | null, dealType: "RENT" as "RENT" | "SALE" | null };
  it("KEEPS a no-price post that has rooms (+ city)", () => {
    const c = extractListingFromPost("דירת 4 חדרים משופצת בקריית אונו, מרפסת, חניה, כניסה מיידית 050-1234567", ctx);
    expect(c).not.toBeNull();
    const p = parseListing(c!.text);
    expect(p.rooms).toBe(4);
    expect(p.price).toBeNull();
  });
  it("still REJECTS a post with no rooms", () => {
    expect(extractListingFromPost("דירה יפה בקריית אונו, מרפסת וחניה", ctx)).toBeNull();
  });
});

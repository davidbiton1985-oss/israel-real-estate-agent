import { describe, it, expect } from "vitest";
import { jaccardSimilarity, normalizeForFuzzy, tokenSet, isLikelyDuplicateText, distinctiveSimilarity } from "../dedup";

describe("fuzzy dedup — isLikelyDuplicateText (the function actually used for repost detection)", () => {
  const ORIGINAL =
    'להשכרה בגני תקווה! דירת 4 חדרים משופצת, 100 מ"ר, מרפסת שמש גדולה, חניה בטאבו, קומה 2 מתוך 4 עם מעלית, ממ"ד ומחסן. ' +
    'ללא תיווך — ישירות מבעל הדירה. 7,200 ש"ח לחודש. כניסה מיידית!';

  const REWORDED_REPOST =
    'גני תקווה — דירת 4 חדרים, 100 מ"ר עם מרפסת שמש, חניה, מעלית, ממ"ד. ללא תיווך. 7,200 ₪ לחודש. כניסה מיידית.';

  const MORE_HEAVILY_REWORDED_REPOST =
    'שוב עולה: גני תקווה, 100 מ"ר, קומה 2, מרפסת שמש, מחסן, חניה בטאבו. ללא תיווך, ישירות מהבעלים. 7,200 בחודש.';

  // Same city, same rooms, very close price (as the fuzzy candidate query would
  // surface) — but a genuinely different apartment. This exact pair was a real
  // false positive caught during Phase 4 manual QA (before stopword-filtering
  // + thousands-separator fix): balcony present/absent, different phrasing.
  const DIFFERENT_APT_NO_BALCONY =
    'להשכרה בקרית אונו דירת 4 חדרים, 100 מ"ר, אין מרפסת, חניה, מעלית, ממ"ד. ללא תיווך. 6,900 ש"ח לחודש.';
  const DIFFERENT_APT_NO_BROKER =
    'להשכרה דירת 4 חדרים בקרית אונו, 98 מ"ר, מרפסת, חניה, מעלית. 7,100 ש"ח. לא למתווכים!!';

  const DIFFERENT_APT_DESCRIPTIVE =
    'למכירה דירה יוקרתית בהוד השרון, 4 חדרים, קומה גבוהה עם נוף פתוח לעבר הפארק. משופצת ברמת גימור גבוהה, מטבח איטלקי, ' +
    'ג׳קוזי במרפסת. מיקום שקט ויוקרתי, קרוב לבתי ספר. 7,200 ש"ח.';

  it("same listing reworded slightly → detected as a likely duplicate", () => {
    expect(isLikelyDuplicateText(ORIGINAL, REWORDED_REPOST)).toBe(true);
  });

  it("same listing reworded more heavily → still detected as a likely duplicate", () => {
    expect(isLikelyDuplicateText(ORIGINAL, MORE_HEAVILY_REWORDED_REPOST)).toBe(true);
  });

  it("different apartment, same city/price-band/rooms, generic shared vocabulary → NOT a duplicate", () => {
    expect(isLikelyDuplicateText(DIFFERENT_APT_NO_BALCONY, DIFFERENT_APT_NO_BROKER)).toBe(false);
  });

  it("different apartment, distinctive descriptive text → NOT a duplicate", () => {
    expect(isLikelyDuplicateText(ORIGINAL, DIFFERENT_APT_DESCRIPTIVE)).toBe(false);
  });

  it("too little distinctive content on either side → NOT a duplicate (can't judge safely)", () => {
    expect(isLikelyDuplicateText("דירה יפה", "דירה יפה מאוד")).toBe(false);
  });

  it("identical text → duplicate", () => {
    expect(isLikelyDuplicateText(ORIGINAL, ORIGINAL)).toBe(true);
  });
});

describe("distinctiveSimilarity vs raw jaccardSimilarity", () => {
  it("stopword filtering lowers the score for generic-vocabulary overlap", () => {
    const a = 'להשכרה בקרית אונו דירת 4 חדרים, 100 מ"ר, אין מרפסת, חניה, מעלית, ממ"ד. ללא תיווך. 6,900 ש"ח לחודש.';
    const b = 'להשכרה דירת 4 חדרים בקרית אונו, 98 מ"ר, מרפסת, חניה, מעלית. 7,100 ש"ח. לא למתווכים!!';
    expect(distinctiveSimilarity(a, b)).toBeLessThan(jaccardSimilarity(a, b));
  });
});

describe("dedup primitives", () => {
  it("normalizeForFuzzy strips punctuation and lowercases", () => {
    expect(normalizeForFuzzy("Hello, World!!!")).toBe("hello world");
  });

  it("normalizeForFuzzy keeps thousands-separator commas inside numbers intact (no spurious digit-fragment collisions)", () => {
    const words = normalizeForFuzzy('6,900 ש"ח').split(" ");
    expect(words).toContain("6900");
    expect(words).not.toContain("900"); // must not split into a standalone 3-digit fragment
  });

  it("tokenSet drops single-character noise tokens", () => {
    const tokens = tokenSet('דירת 4 חד\' ב-פתח תקווה');
    expect(tokens.has("ב")).toBe(false);
  });

  it("jaccardSimilarity: identical text → 1, unrelated text → 0, empty text → 0", () => {
    expect(jaccardSimilarity("שלום עולם", "שלום עולם")).toBe(1);
    expect(jaccardSimilarity("שלום עולם", "hello world completely different")).toBe(0);
    expect(jaccardSimilarity("", "שלום עולם")).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { classifyCaptureSource, looksLikeMergedYad2Cards } from "../capture";

describe("looksLikeMergedYad2Cards — reject grid-blob captures (tab-watcher < v1.1)", () => {
  it("flags a merged blob of several result cards (the real wrong-link bug shape)", () => {
    // Shaped like the corrupt j32bewca rawText: multiple price+rooms card blocks.
    const merged = [
      'נדל"ן להשכרה בשכונת מרכז הישוב, גני תקווה',
      "9,200 ₪",
      "גני תקווה",
      '5 חדרים • קומה 9 • 160 מ"ר',
      "7,900 ₪",
      "הגליל, גני תקווה",
      '5 חדרים • קומה 5 • 175 מ"ר',
      "9,500 ₪",
      "גני תקווה",
      '4 חדרים • קומה 2 • 110 מ"ר',
    ].join("\n");
    expect(looksLikeMergedYad2Cards(merged)).toBe(true);
  });

  it("passes a normal single card (one price, one rooms)", () => {
    const single = ['דירת 5 חדרים להשכרה בגני תקווה', "9,200 ₪", '5 חדרים • קומה 9 • 160 מ"ר'].join("\n");
    expect(looksLikeMergedYad2Cards(single)).toBe(false);
  });

  it("passes a listing that mentions rooms twice but has one price (strict AND)", () => {
    const twiceRooms = 'דירת 4 חדרים, מתוכם 3 חדרים עם מרפסת. 6,500 ₪ לחודש';
    expect(looksLikeMergedYad2Cards(twiceRooms)).toBe(false);
  });
});

describe("capture-source classification (bookmarklet + Yad2 tab watcher)", () => {
  it("Yad2 item URL → YAD2 source, credited to the YAD2_BROWSER health row", () => {
    const c = classifyCaptureSource("https://www.yad2.co.il/realestate/item/abc123", "יד2 - דירות להשכרה");
    expect(c.source).toBe("YAD2");
    expect(c.healthSource).toBe("YAD2_BROWSER");
    expect(c.meta).toEqual({});
  });

  it("Yad2 search-page URL also maps to YAD2", () => {
    const c = classifyCaptureSource("https://www.yad2.co.il/realestate/rent?city=0", null);
    expect(c.source).toBe("YAD2");
    expect(c.healthSource).toBe("YAD2_BROWSER");
  });

  it("Facebook group URL → FACEBOOK with surface metadata + FACEBOOK health row", () => {
    const c = classifyCaptureSource("https://www.facebook.com/groups/123/permalink/456/", "דירות להשכרה בגני תקווה");
    expect(c.source).toBe("FACEBOOK");
    expect(c.healthSource).toBe("FACEBOOK");
    expect(c.meta.fbSurface).toBe("GROUP");
    expect(c.meta.fbSourceName).toBe("דירות להשכרה בגני תקווה");
  });

  it("other URL → generic URL source, no health tracking", () => {
    const c = classifyCaptureSource("https://www.madlan.co.il/listings/xyz", "Madlan");
    expect(c.source).toBe("URL");
    expect(c.healthSource).toBeNull();
  });

  it("no URL at all → generic URL source", () => {
    const c = classifyCaptureSource(null, null);
    expect(c.source).toBe("URL");
    expect(c.healthSource).toBeNull();
  });
});

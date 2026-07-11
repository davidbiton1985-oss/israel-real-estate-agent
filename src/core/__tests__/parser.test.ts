import { describe, it, expect } from "vitest";
import { parseListing, classifyBroker, extractYad2Id } from "../parser";

describe("broker classification", () => {
  it("ללא תיווך → PRIVATE (not BROKER despite the תיווך substring)", () => {
    const r = classifyBroker('דירה מהממת, ללא תיווך! 7,200 ש"ח');
    expect(r.status).toBe("PRIVATE");
    expect(r.confidence).toBe("high");
    expect(r.evidence).toBe("ללא תיווך");
  });

  it("לא למתווכים → PRIVATE", () => {
    const r = classifyBroker("דירה יפה בגני תקווה. לא למתווכים!");
    expect(r.status).toBe("PRIVATE");
    expect(r.evidence).toBe("לא למתווכים");
  });

  it("ללא דמי תיווך → PRIVATE + fee NONE", () => {
    const r = classifyBroker("להשכרה, ללא דמי תיווך, כניסה מיידית");
    expect(r.status).toBe("PRIVATE");
    expect(r.feeStatus).toBe("NONE");
  });

  it("משרד תיווך → BROKER high confidence", () => {
    const r = classifyBroker("משרד תיווך אלמוג נכסים מציג: דירת 4 חדרים");
    expect(r.status).toBe("BROKER");
    expect(r.confidence).toBe("high");
  });

  it("דמי תיווך חודש שכירות → BROKER + fee EXISTS with detail", () => {
    const r = classifyBroker("דירה יפה. דמי תיווך: חודש שכירות");
    expect(r.status).toBe("BROKER");
    expect(r.feeStatus).toBe("EXISTS");
    expect(r.feeText).toContain("חודש שכירות");
  });

  it("bare תיווך → BROKER medium confidence", () => {
    const r = classifyBroker("דירת 3 חדרים, תיווך");
    expect(r.status).toBe("BROKER");
    expect(r.confidence).toBe("medium");
  });

  it("'לפרטים: 050' must NOT match פרטי → UNKNOWN", () => {
    const r = classifyBroker("דירת 4 חדרים בקרית אונו. לפרטים: 050-1234567");
    expect(r.status).toBe("UNKNOWN");
    expect(r.confidence).toBe("low");
  });

  it("'כוללת מזגן' must NOT match the ללת abbreviation", () => {
    const r = classifyBroker("הדירה כוללת מזגן בכל חדר");
    expect(r.status).toBe("UNKNOWN");
  });

  it("בית פרטי (property type) must NOT classify as PRIVATE broker status", () => {
    const r = classifyBroker("בית פרטי למכירה ברעננה, 6 חדרים");
    expect(r.status).toBe("UNKNOWN");
  });

  it("פרטי alone → PRIVATE medium confidence", () => {
    const r = classifyBroker("להשכרה מפרטי, דירת 3 חדרים");
    expect(r.status).toBe("PRIVATE");
    expect(r.confidence).toBe("medium");
  });

  it("gershayim variant ממ״ד quotes: לל״ת → PRIVATE", () => {
    const r = classifyBroker("דירת 4 חד' לל״ת");
    expect(r.status).toBe("PRIVATE");
  });
});

describe("price extraction", () => {
  it.each([
    ['7,200 ש"ח לחודש', 7200],
    ["₪7200", 7200],
    ["המחיר 8,500 ₪ לחודש", 8500],
    ["שכירות: 6900", 6900],
    ["2.45 מיליון", 2450000],
    ['2,450,000 ש"ח', 2450000],
    ["5500 שח", 5500],
    // ש"ח typed as two apostrophes / two gershes — a real FB post in this form
    // slipped past the min-price filter because the price parsed as null
    ["6700 ש''ח", 6700],
    ["6700 ש׳׳ח", 6700],
    ['שכ"ד: 7,200', 7200],
    ["שכד 6800", 6800],
  ])("%s → %d", (text, expected) => {
    expect(parseListing(text).price).toBe(expected);
  });

  it("the real below-minimum FB post now parses its price (regression)", () => {
    const real = `להשכרה האוסף של אפרת דירת 4 חדרים מקסימה בקרית אונו . 6700 ש''ח שכ"ד`;
    expect(parseListing(real).price).toBe(6700);
  });

  it("no price → null", () => {
    expect(parseListing("דירה מהממת בגני תקווה").price).toBeNull();
  });
});

describe("rooms extraction", () => {
  it.each([
    ["דירת 4 חדרים", 4],
    ["3.5 חדרים מרווחים", 3.5],
    ["4 חד' + מרפסת", 4],
    ["דירת 5", 5],
    ["3 rooms apartment", 3],
  ])("%s → %s", (text, expected) => {
    expect(parseListing(text).rooms).toBe(expected);
  });
});

describe("size / floor extraction", () => {
  it('100 מ"ר → 100', () => {
    expect(parseListing('דירה 100 מ"ר').sizeSqm).toBe(100);
  });
  it("95 מטר → 95", () => {
    expect(parseListing("כ-95 מטר").sizeSqm).toBe(95);
  });
  it("קומה 3 מתוך 5 → floor 3, total 5", () => {
    const p = parseListing("קומה 3 מתוך 5 עם מעלית");
    expect(p.floor).toBe(3);
    expect(p.totalFloors).toBe(5);
  });
  it('ק"ק → floor 0', () => {
    expect(parseListing('דירת גן בק"ק').floor).toBe(0);
  });
});

describe("feature extraction", () => {
  const text = 'דירה משופצת עם מרפסת שמש, חניה בטאבו, מעלית, ממ"ד ומחסן. מרוהטת. כניסה ב-1.9, גמיש. ארנונה: 450, ועד בית: 150';
  const p = parseListing(text);

  it("balcony/parking/elevator/mamad/storage detected", () => {
    expect(p.balcony).toBe(true);
    expect(p.parking).toBe(true);
    expect(p.elevator).toBe(true);
    expect(p.mamad).toBe(true);
    expect(p.storage).toBe(true);
  });
  it("condition/furnished detected", () => {
    expect(p.condition).toBe("RENOVATED");
    expect(p.furnished).toBe("FURNISHED");
  });
  it("entry date + flexible detected", () => {
    expect(p.entryDate).toBe("1.9");
    expect(p.entryFlexible).toBe(true);
  });
  it("arnona + vaad detected", () => {
    expect(p.arnonaMonthly).toBe(450);
    expect(p.vaadMonthly).toBe(150);
  });
  it("negations: אין מרפסת → false", () => {
    expect(parseListing("דירה יפה אבל אין מרפסת").balcony).toBe(false);
  });
  it("ריהוט חלקי → PARTIAL", () => {
    expect(parseListing("מגיעה עם ריהוט חלקי").furnished).toBe("PARTIAL");
  });
});

describe("city / neighborhood / street / deal type", () => {
  it("Hebrew city alias → canonical", () => {
    expect(parseListing("להשכרה בגני תקווה").city).toBe("Ganei Tikva");
    expect(parseListing('דירה בפ"ת').city).toBe("Petah Tikva");
  });
  it("kibbutz Glil Yam card (no other city word) → Glil Yam", () => {
    expect(parseListing("להשכרה בשכונת גליל ים, גליל ים\n9,000 ₪\nגליל ים, גליל ים").city).toBe("Glil Yam");
  });
  it("Herzliya wins over Glil Yam when both appear ('גליל ים, הרצליה')", () => {
    expect(parseListing("להשכרה בשכונת גליל ים, הרצליה דירת 4 חדרים").city).toBe("Herzliya");
  });
  it("neighborhood via שכונת", () => {
    expect(parseListing("בשכונת גני יהודה, דירת 4 חדרים").neighborhood).toBe("גני יהודה");
  });
  it("street via רחוב", () => {
    expect(parseListing("ברחוב הרצל 12, קרית אונו").street).toBe("הרצל");
  });
  it("rent vs sale", () => {
    expect(parseListing("להשכרה דירת 3 חדרים").dealType).toBe("RENT");
    expect(parseListing("למכירה! דירת 4 חדרים").dealType).toBe("SALE");
  });
});

describe("Yad2 ID extraction", () => {
  it.each([
    ["https://www.yad2.co.il/realestate/item/abc123", "abc123"],
    ["https://www.yad2.co.il/item/xyz789?opened-from=feed", "xyz789"],
    ["https://www.yad2.co.il/realestate/rent/item/q1w2e3", "q1w2e3"],
    ["https://www.yad2.co.il/s/c?id=555444", "555444"],
  ])("%s → %s", (url, expected) => {
    expect(extractYad2Id(url, "")).toBe(expected);
  });

  it("extracts from pasted text containing a yad2 link", () => {
    expect(extractYad2Id(null, "תראו את זה: https://www.yad2.co.il/realestate/item/demo42 מדהים")).toBe("demo42");
  });

  it("non-yad2 URL → null", () => {
    expect(extractYad2Id("https://example.com/item/123", "")).toBeNull();
  });
});

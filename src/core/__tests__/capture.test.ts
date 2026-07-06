import { describe, it, expect } from "vitest";
import { classifyCaptureSource } from "../capture";

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

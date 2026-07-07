import { describe, it, expect } from "vitest";
import {
  isFacebookNotification,
  classifyFbUrl,
  extractFbPostUrl,
  extractPostText,
  parseFacebookNotification,
} from "../connectors/facebook";
import { emailToRawItem } from "../connectors/email";
import { parseListing } from "../parser";

describe("Facebook notification detection", () => {
  it("recognizes facebookmail.com senders", () => {
    expect(isFacebookNotification('"Facebook" <notification@facebookmail.com>')).toBe(true);
    expect(isFacebookNotification("noreply@yad2.co.il")).toBe(false);
  });
});

describe("Facebook URL surface classification", () => {
  it.each([
    ["https://www.facebook.com/groups/1234567/permalink/8901234/", "GROUP"],
    ["https://www.facebook.com/marketplace/item/555/", "MARKETPLACE"],
    ["https://www.facebook.com/share/p/AbC123/", "SHARED"],
    ["https://www.facebook.com/profile.php?id=100001", "PROFILE"],
    ["https://www.facebook.com/pages/Almog-Realty/222333", "PAGE"],
    ["https://www.facebook.com/almog.realty/posts/777888", "PUBLIC_POST"],
    ["https://www.facebook.com/permalink.php?story_fbid=1&id=2", "PUBLIC_POST"],
    [null, "UNKNOWN"],
    ["https://example.com/x", "UNKNOWN"],
  ])("%s → %s", (url, expected) => {
    expect(classifyFbUrl(url)).toBe(expected);
  });
});

describe("Facebook notification email parsing", () => {
  const GROUP_BODY = [
    'להשכרה בגני תקווה! דירת 4 חדרים משופצת, 100 מ"ר, מרפסת שמש, חניה, מעלית. ללא תיווך. 7,200 ש"ח לחודש. כניסה מיידית.',
    "",
    "צפה בפוסט",
    "https://www.facebook.com/groups/545454/permalink/909090/",
    "הודעה זו נשלחה אל you@example.com",
    "לביטול ההרשמה לחץ כאן",
  ].join("\n");

  it("Hebrew group post: author + group + surface + post URL + clean text", () => {
    const c = parseFacebookNotification("דוד כהן פרסם בקבוצה דירות להשכרה בגני תקווה והסביבה", GROUP_BODY);
    expect(c).not.toBeNull();
    expect(c!.fbSurface).toBe("GROUP");
    expect(c!.fbAuthor).toBe("דוד כהן");
    expect(c!.fbSourceName).toBe("דירות להשכרה בגני תקווה והסביבה");
    expect(c!.postUrl).toContain("/groups/545454/permalink/909090");
    expect(c!.postText).toContain("דירת 4 חדרים");
    expect(c!.postText).not.toContain("לביטול ההרשמה"); // boilerplate stripped
    expect(c!.postText).not.toContain("facebook.com");
  });

  it("English group post subject", () => {
    const c = parseFacebookNotification("David Cohen posted in Apartments Ganei Tikva", GROUP_BODY);
    expect(c!.fbSurface).toBe("GROUP");
    expect(c!.fbAuthor).toBe("David Cohen");
    expect(c!.fbSourceName).toBe("Apartments Ganei Tikva");
  });

  it("unmatched subject falls back to URL-based surface", () => {
    const c = parseFacebookNotification("יש פוסטים חדשים", GROUP_BODY);
    expect(c!.fbSurface).toBe("GROUP"); // from the /groups/ permalink
  });

  it("membership/security/engagement emails are NOT ingested as listings", () => {
    // the exact junk that leaked into the DB:
    expect(parseFacebookNotification("David, you're now a member of דירות להשכרה קריית אונו", GROUP_BODY)).toBeNull();
    expect(parseFacebookNotification("081502 is your code to confirm this email", GROUP_BODY)).toBeNull();
    expect(parseFacebookNotification("דוד, הצטרפת לקבוצה דירות בגני תקווה", GROUP_BODY)).toBeNull();
    expect(parseFacebookNotification("Ruti commented on your post", GROUP_BODY)).toBeNull();
  });

  it("shared-post subject → SHARED", () => {
    const body = [
      "למכירה בפתח תקווה דירת 4 חדרים, 2.4 מיליון. פרטים אצל רותי.",
      "https://www.facebook.com/share/p/XyZ/",
      "unsubscribe",
    ].join("\n");
    const c = parseFacebookNotification("רותי לוי shared a post", body);
    expect(c!.fbSurface).toBe("SHARED");
    expect(c!.fbAuthor).toBe("רותי לוי");
    expect(c!.postUrl).toContain("/share/p/XyZ");
  });

  it("comment/like noise (no post body) → null, not ingested", () => {
    expect(parseFacebookNotification("מישהו הגיב על הפוסט שלך", "צפה בתגובה\nhttps://www.facebook.com/n/xyz\nunsubscribe")).toBeNull();
  });

  it("short snippet with missing fields still becomes a candidate (missing ≠ reject)", () => {
    const c = parseFacebookNotification(
      "שרה פרסמה בקבוצה דירות גני תקווה",
      "דירת 4 חדרים מהממת בגני תקווה, פרטים בפרטי\nhttps://www.facebook.com/groups/1/permalink/2/\nunsubscribe"
    );
    expect(c).not.toBeNull();
    const parsed = parseListing(c!.postText);
    expect(parsed.city).toBe("Ganei Tikva");
    expect(parsed.price).toBeNull(); // missing — handled downstream as missing info, not rejection
  });
});

describe("email connector integration (FB notification → EmailRawItem)", () => {
  it("routes facebookmail senders through the FB parser with metadata", () => {
    const item = emailToRawItem(
      '"Facebook" <notification@facebookmail.com>',
      "דוד כהן פרסם בקבוצה דירות להשכרה בגני תקווה",
      'להשכרה בגני תקווה! דירת 4 חדרים, 100 מ"ר, מרפסת, חניה, מעלית. ללא תיווך. 7,200 ש"ח.\nhttps://www.facebook.com/groups/545454/permalink/909090/\nunsubscribe'
    );
    expect(item).not.toBeNull();
    expect(item!.source).toBe("FACEBOOK");
    expect(item!.fbMeta?.fbSurface).toBe("GROUP");
    expect(item!.fbMeta?.fbAuthor).toBe("דוד כהן");
    expect(item!.url).toContain("facebook.com/groups/");

    // and the strong Hebrew post parses fully (broker classifier included):
    const parsed = parseListing(item!.rawText, item!.url);
    expect(parsed.city).toBe("Ganei Tikva");
    expect(parsed.price).toBe(7200);
    expect(parsed.rooms).toBe(4);
    expect(parsed.brokerStatus).toBe("PRIVATE");
    expect(parsed.brokerEvidence).toBe("ללא תיווך");
  });

  it("broker page post classifies as BROKER via existing classifier", () => {
    const item = emailToRawItem(
      "notification@facebookmail.com",
      "אלמוג נכסים פרסמה פוסט חדש",
      'חדש אצלנו! להשכרה בקרית אונו דירת 4 חדרים, 105 מ"ר, מרפסת. משרד תיווך אלמוג, דמי תיווך חודש. 7,400 ש"ח.\nhttps://www.facebook.com/almog.realty/posts/777/\nunsubscribe'
    );
    expect(item!.fbMeta?.fbSurface).toBe("PAGE");
    expect(item!.fbMeta?.fbSourceName).toBe("אלמוג נכסים");
    const parsed = parseListing(item!.rawText);
    expect(parsed.brokerStatus).toBe("BROKER");
  });

  it("non-Facebook alert emails are unaffected (Yad2 path unchanged)", () => {
    const item = emailToRawItem(
      "noreply@yad2.co.il",
      "נכס חדש",
      'להשכרה בגני תקווה דירת 4 חדרים 7,200 ש"ח https://www.yad2.co.il/realestate/item/abc1'
    );
    expect(item!.source).toBe("YAD2");
    expect(item!.fbMeta).toBeUndefined();
  });
});

describe("extractFbPostUrl / extractPostText primitives", () => {
  it("finds group permalinks and notification redirect links", () => {
    expect(extractFbPostUrl("text https://www.facebook.com/groups/1/permalink/2/ more")).toContain("/groups/1/");
    expect(extractFbPostUrl("x https://www.facebook.com/n/abc123 y")).toContain("/n/abc123");
    expect(extractFbPostUrl("no links here")).toBeNull();
  });

  it("strips boilerplate lines but keeps Hebrew post content", () => {
    const text = extractPostText("דירה יפה מאוד בגני תקווה\nView post\nunsubscribe\nהצג\nעוד שורה של תוכן אמיתי");
    expect(text).toContain("דירה יפה מאוד");
    expect(text).toContain("עוד שורה של תוכן אמיתי");
    expect(text).not.toMatch(/View post|unsubscribe|הצג/);
  });
});

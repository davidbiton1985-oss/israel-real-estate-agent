// Text-based listing extraction — the DOM-agnostic automatic path for Facebook.
// Calibrated against real harvested group text, which revealed:
//   • the harvest is polluted with our own watcher badge + Facebook nav chrome
//   • the group is city-specific ("דירות להשכרה קריית אונו") so posts OMIT the
//     city and often the rent/sale word — those come from the GROUP, not the post
//   • posts are multi-line (rooms on one line, price several lines later)
// So we: strip noise, infer city + deal-type from the group header, and stitch
// consecutive content lines into windows, keeping windows that carry a price and
// a room count (the two facts a listing states in-text).
import { parseListing, CITIES, collapseSpacedHebrew } from "./parser";

// Lines that are watcher UI or Facebook page chrome — never listing content.
const NOISE_LINE = new RegExp(
  "^(" +
    [
      "RE-Agent", "📩",
      "Number of unread", "Public group", "Private group", "[\\d.,]+K? members?",
      "Invite", "Share", "Shared", "Joined", "Join group", "Join", "More", "About",
      "Discussion", "Buy and Sell", "Featured", "People", "Media", "Events", "Files",
      "Write something", "Anonymous post", "Feeling/activity", "Feeling", "Poll",
      "\\d+ new", "sort group feed by", "Recent activity", "New activity", "Facebook",
      "Follow", "Following", "All reactions", "Like", "Comment", "Reply", "Send",
      "Submit your first", "Public", "Anyone can", "Visible", "Recent media",
      "See all", "See more", "See less", "Write a comment", "Active", "Top contributor",
      "Admin", "Moderator", "Author", "·", "\\d+[wdhms]$", "Home", "Menu", "Marketplace",
      // Hebrew chrome
      "לייק", "תגובה", "תגובות", "שיתוף", "שתף", "הגב", "כתוב(?:\\/כתבי)? תגובה",
      "הצג עוד", "הצג פחות", "כל התגובות", "הצטרף", "עקוב", "עוקב", "פעיל",
      "מנהל", "מנהלת", "כתבו משהו", "חברים", "אודות", "דיון", "פרטי",
    ].join("|") +
    ")",
  "i"
);

function contentLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && !NOISE_LINE.test(l));
}

/** Infer the group's city + deal type from the header lines (the group name). */
export function groupContext(text: string): { city: string | null; dealType: "RENT" | "SALE" | null } {
  const head = contentLines(text).slice(0, 12).join("  ");
  let city: string | null = null;
  const hits: string[] = [];
  for (const c of CITIES) {
    if (c.aliases.some((a) => head.includes(a))) hits.push(c.canonical);
  }
  // Use the first city named in the group (city-specific groups often list a
  // primary + neighbours). A post that states its own city overrides this later.
  if (hits.length >= 1) city = hits[0];
  let dealType: "RENT" | "SALE" | null = null;
  const rent = /להשכרה|השכרה|שכירות/.test(head);
  const sale = /למכירה|מכירה/.test(head);
  if (rent && !sale) dealType = "RENT";
  else if (sale && !rent) dealType = "SALE";
  return { city, dealType };
}

/** Consecutive-line windows (up to 12 lines) so multi-line posts are stitched. */
export function splitIntoListings(text: string): string[] {
  const lines = contentLines(text);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let w = 1; w <= 12 && i + w <= lines.length; w++) {
      out.push(lines.slice(i, i + w).join(" "));
    }
  }
  return out;
}

export interface Candidate {
  text: string;
  city: string;
  dealType: "RENT" | "SALE" | null;
}

/**
 * Real listings: windows carrying a price AND a room count. City and deal-type
 * fall back to the group context when the post omits them (the common case).
 * Deduped by city|price|rooms so overlapping windows collapse to one.
 */
export function listingCandidatesDetailed(
  text: string,
  ctxOverride?: { city: string | null; dealType: "RENT" | "SALE" | null }
): Candidate[] {
  const ctx = ctxOverride ?? groupContext(text);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const seg of splitIntoListings(text)) {
    if (isNotAnOffer(seg)) continue; // skip wanted/roommate/land/investment windows
    const p = parseListing(seg);
    if (p.price == null || p.rooms == null) continue; // need both in-post facts
    const city = p.city ?? ctx.city;
    if (city == null) continue; // must be locatable (from post or group)
    const sig = `${city}|${p.price}|${p.rooms}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    // Fold group context into the text so the downstream parse sees city + deal too.
    const prefix = [ctx.dealType === "RENT" ? "להשכרה" : ctx.dealType === "SALE" ? "למכירה" : "", p.city ? "" : city]
      .filter(Boolean)
      .join(" ");
    out.push({ text: (prefix ? prefix + " " : "") + seg, city, dealType: p.dealType ?? ctx.dealType });
  }
  return out;
}

/** Back-compat: just the candidate texts (with group city/deal folded in). */
export function listingCandidates(text: string): string[] {
  return listingCandidatesDetailed(text).map((c) => c.text);
}

// Posts that are NOT an apartment offer we care about — someone LOOKING for a
// place, a roommate wanted, or land/investment. Rejected outright on BOTH the
// per-post AND the feed/bulk extraction paths (a city-specific group's title
// says "for rent", so a wanted post there inherits RENT and would otherwise
// masquerade as a real listing).
const NOT_AN_OFFER = new RegExp(
  [
    // roommate wanted
    "שותף", "שותפה", "שותפים", "שותפות", "roommate",
    // "looking for" a place: מחפש/מחפשת/מחפשים (+ optional "/ת"), then within a few
    // chars a housing noun. Catches מחפשת דירת…, מחפש/ת דירה, מחפשים יחידה, מחפש לשכור.
    "מחפש(?:ים|ות|ת)?(?:\\s*\\/\\s*ת)?[^\\n]{0,12}?(?:דיר|יחיד|סאבלט|סבלט|בית|לשכור|להשכיר|לגור|שכיר)",
    // "wanted/needed" a place
    "דרוש(?:ה|ים|ות)?[^\\n]{0,12}?(?:דיר|יחיד|בית)",
    // "interested in renting" / "want to rent" — but NOT מעוניין להשכיר (that is an OFFER)
    "מעוניינ(?:ת|ים|ות)?[^\\n]{0,10}?(?:לשכור|בדיר|לגור)",
    "רוצ(?:ה|ים|ות)?[^\\n]{0,10}?לשכור",
    "זקוק(?:ה|ים)?[^\\n]{0,10}?דיר",
    // land / investment / handover — not a rental apartment offer
    "מגרש", "קרקע(?:\\s|,|\\.|$)", "השקעה", "נחלה", "למסירה",
    // sublets / temporary rentals — not a standard rental (user: reject)
    "סאבלט", "סבלט", "סאב[- ]לט", "sublet", "השכרת משנה", "השכרה זמנית",
    "לתקופה קצרה", "השכרה לתקופה",
    // month-bounded offers ("להשכרה לספט׳", "להשכרה ליולי-אוגוסט") = sublet
    "להשכרה\\s+ל(?:ינו|פבר|מרץ|אפר|מאי|יוני|יולי|אוג|ספט|אוק|נוב|דצמ|חודש)",
  ].join("|"),
  "i"
);

/** True when the text is a wanted/roommate/land/investment post, not an apartment OFFER. */
export function isNotAnOffer(text: string): boolean {
  return NOT_AN_OFFER.test(text);
}

/**
 * Extract ONE listing from a SINGLE Facebook post (posts-mode). Parses the whole
 * post as one unit — no sub-window slicing, which was creating false matches by
 * combining unrelated numbers/words. Detects SALE by an explicit word OR a large
 * price (rent is monthly = thousands; sale = hundreds of thousands / millions),
 * so a ₪2.7M sale is never mislabeled as an in-range rental. City/deal fall back
 * to the group context. Returns null if it isn't a real offer we can locate.
 */
export function extractListingFromPost(
  rawText: string,
  ctx: { city: string | null; dealType: "RENT" | "SALE" | null }
): Candidate | null {
  // Collapse letter-spaced Hebrew FIRST ("ל מ כ י ר ה") so neither the sale
  // detector nor the wanted-post filter can be styled around.
  const clean = collapseSpacedHebrew(contentLines(rawText).join("  "));
  if (clean.length < 15) return null;
  if (isNotAnOffer(clean)) return null; // roommate / wanted / land / investment

  const p = parseListing(clean);
  // Facebook-only rule: ROOMS is required; PRICE is OPTIONAL — many real FB posts
  // omit the price, and we'd rather surface a right-city/right-rooms apartment and
  // ask the price than miss it. (Yad2 uses a different path and is unaffected.)
  if (p.rooms == null) return null;

  // Deal type: explicit sale word, "מיליון", OR a large PARSED price (rent is
  // monthly = thousands; a parsed price ≥ 50,000 means sale). We use the parsed
  // price — not a raw digit scan — so phone numbers don't trip it.
  let dealType: "RENT" | "SALE" | null;
  if (/למכירה|נמכרת/.test(clean) || /מיליון|million/i.test(clean) || (p.price != null && p.price >= 50000)) {
    dealType = "SALE";
  } else if (/להשכרה|להשכיר|שכירות|לחודש|לחו['׳]/.test(clean)) {
    dealType = "RENT";
  } else {
    dealType = ctx.dealType;
  }

  const city = p.city ?? ctx.city;
  if (city == null) return null;

  const dealWord = dealType === "SALE" ? "למכירה" : dealType === "RENT" ? "להשכרה" : "";
  const cityWord = p.city ? "" : city;
  const text = [dealWord, cityWord, clean].filter(Boolean).join(" ");
  return { text, city, dealType };
}

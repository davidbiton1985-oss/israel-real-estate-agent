// Text-based listing extraction — the DOM-agnostic automatic path for Facebook.
// Calibrated against real harvested group text, which revealed:
//   • the harvest is polluted with our own watcher badge + Facebook nav chrome
//   • the group is city-specific ("דירות להשכרה קריית אונו") so posts OMIT the
//     city and often the rent/sale word — those come from the GROUP, not the post
//   • posts are multi-line (rooms on one line, price several lines later)
// So we: strip noise, infer city + deal-type from the group header, and stitch
// consecutive content lines into windows, keeping windows that carry a price and
// a room count (the two facts a listing states in-text).
import { parseListing, CITIES } from "./parser";

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
  if (hits.length === 1) city = hits[0]; // single-city group → confident; multi-city → leave to post
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
export function listingCandidatesDetailed(text: string): Candidate[] {
  const ctx = groupContext(text);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const seg of splitIntoListings(text)) {
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

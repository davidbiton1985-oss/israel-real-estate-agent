// Duplicate detection: exact fingerprint (yad2 ID / URL / content hash) plus a
// lightweight fuzzy fallback (token-overlap similarity) for reposts that share
// no URL/ID — e.g. the same apartment posted to Yad2 and again on Facebook.
import { createHash } from "crypto";
import type { ParsedListing } from "./parser";

export function fingerprint(parsed: ParsedListing, rawText: string, url: string | null): string {
  // Strongest signal first: Yad2 listing ID
  if (parsed.yad2ListingId) return `yad2:${parsed.yad2ListingId}`;
  if (url) return `url:${createHash("sha1").update(url.trim().toLowerCase()).digest("hex")}`;
  // Content-based: price + rooms + city + normalized text hash
  const normText = rawText.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 400);
  const key = `${parsed.price ?? "?"}|${parsed.rooms ?? "?"}|${parsed.city ?? "?"}|${createHash("sha1").update(normText).digest("hex")}`;
  return `content:${createHash("sha1").update(key).digest("hex")}`;
}

// ---------------------------------------------------------------------------
// Fuzzy text similarity (Jaccard token overlap). No Levenshtein — overkill for
// personal-scale listing volumes and noticeably slower for little real gain.
// ---------------------------------------------------------------------------
export function normalizeForFuzzy(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d),(\d{3})/g, "$1$2") // "6,900" -> "6900": a thousands separator, not a token break
    .replace(/[.,!?;:'"׳״()\-–—*🙂🏠📉🔄]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenSet(text: string): Set<string> {
  return new Set(normalizeForFuzzy(text).split(" ").filter((t) => t.length > 1));
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = tokenSet(a);
  const setB = tokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Generic Israeli real-estate listing vocabulary — words that appear in nearly
// EVERY post regardless of which apartment it is (deal type, rooms, common
// amenities, boilerplate). Stripped before the duplicate-specific comparison
// so that only distinguishing content (street/neighborhood, exact size,
// descriptive detail, negations like "no balcony") drives the match — two
// different apartments in the same city with the same room count would
// otherwise look deceptively similar on generic vocabulary alone.
const LISTING_STOPWORDS = new Set([
  "להשכרה", "למכירה", "דירת", "דירה", "דירות", "חדרים", "חדר", "מרפסת", "חניה", "חנייה",
  "מעלית", "ממ", "תיווך", "מתיווך", "ללא", "בלי", "לחודש", "כניסה", "מיידי", "מיידית",
  "גמיש", "קומה", "מתוך", "בניין", "נכס", "נכסים", "מציג", "מציגה", "פרטי", "מפרטי",
  "for", "rent", "sale", "apartment", "room", "rooms", "balcony", "parking", "elevator",
]);

function distinctiveTokenSet(text: string): Set<string> {
  const all = tokenSet(text);
  const out = new Set<string>();
  for (const t of all) if (!LISTING_STOPWORDS.has(t)) out.add(t);
  return out;
}

/** Jaccard similarity computed only over distinguishing (non-boilerplate) tokens. */
export function distinctiveSimilarity(a: string, b: string): number {
  const setA = distinctiveTokenSet(a);
  const setB = distinctiveTokenSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Threshold is calibrated against distinctive (stopword-filtered) tokens, not
// raw text — reworded reposts of the same apartment cluster around 0.32–0.36
// on real examples; different apartments sharing city/price/rooms cluster
// around 0.09–0.22. 0.3 separates both with margin.
/** Similarity at/above this is treated as "the same listing, reworded." */
export const FUZZY_DUPLICATE_THRESHOLD = 0.3;

/**
 * Is `b` likely a repost/rewording of `a`? Requires at least 3 distinctive
 * tokens on each side (too little distinguishing content to judge safely
 * otherwise) plus high overlap among them.
 */
export function isLikelyDuplicateText(a: string, b: string): boolean {
  const setA = distinctiveTokenSet(a);
  const setB = distinctiveTokenSet(b);
  if (setA.size < 3 || setB.size < 3) return false;
  return distinctiveSimilarity(a, b) >= FUZZY_DUPLICATE_THRESHOLD;
}

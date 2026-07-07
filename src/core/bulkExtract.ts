// Text-based listing extraction — the DOM-agnostic automatic path for Facebook.
// Instead of trying to identify "posts" in Facebook's deliberately-obfuscated
// page structure (which is nearly impossible to do reliably), we take ALL the
// text harvested from the group pages and hunt for apartment listings inside it
// by their content signature: a rent/sale marker with a price / rooms / city
// nearby. This ignores Facebook's post-vs-comment trickery entirely.
import { parseListing } from "./parser";

// Anchors that mark the likely START of a listing (Hebrew + English).
const ANCHOR = /(להשכרה|להשכיר|למכירה|למסירה|for rent|for sale|לשכירות)/gi;

/**
 * Split a big text blob into candidate listing chunks — one per rent/sale anchor,
 * windowed to grab the surrounding details (a little before for a leading city,
 * up to ~700 chars after for price/rooms/features), stopping at the next anchor.
 */
export function splitIntoListings(text: string): string[] {
  const norm = text.replace(/\r/g, "").replace(/[ \t ]+/g, " ");
  const anchors: number[] = [];
  const re = new RegExp(ANCHOR.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) anchors.push(m.index);
  if (anchors.length === 0) return [];

  const out: string[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = Math.max(0, anchors[i] - 50); // a little before → catches a city named first
    const hardEnd = anchors[i] + 700;
    const end = i + 1 < anchors.length ? Math.min(anchors[i + 1], hardEnd) : Math.min(norm.length, hardEnd);
    const chunk = norm.slice(start, end).trim();
    if (chunk.length >= 25) out.push(chunk);
  }
  return out;
}

/**
 * Candidate listing chunks worth ingesting — only those the parser can extract a
 * real apartment signal from (price OR rooms OR a known city). Deduped by a
 * normalized signature so the same listing appearing in several scroll snapshots
 * collapses to one. This filters out pure chatter that happens to sit near an anchor.
 */
export function listingCandidates(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of splitIntoListings(text)) {
    const p = parseListing(chunk);
    if (p.price == null && p.rooms == null && p.city == null) continue;
    const sig = `${p.city ?? ""}|${p.price ?? ""}|${p.rooms ?? ""}|${chunk.slice(0, 40).replace(/\s+/g, "")}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(chunk);
  }
  return out;
}

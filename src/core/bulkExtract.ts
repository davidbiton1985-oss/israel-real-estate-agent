// Text-based listing extraction — the DOM-agnostic automatic path for Facebook.
// We take ALL the text harvested from the group pages and find apartment
// listings inside it by their content signature — NOT by the word "להשכרה"
// (many real posts omit it; the group context implies it). A real listing
// carries at least TWO of {city, price, rooms}; chatter ("which street?",
// "17,000?") has at most one. That combination is the reliable discriminator.
import { parseListing } from "./parser";

/**
 * Break a harvested text blob into candidate segments. A Facebook apartment post
 * is usually one line (the caption) but can span a few; we consider each line on
 * its own AND each line merged with the next two, so multi-line posts (city on
 * one line, price on another) are still captured. Candidates are filtered later
 * by signal count, so extra merged segments are harmless.
 */
export function splitIntoListings(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length >= 10) out.push(lines[i]); // the line alone
    if (i + 1 < lines.length) out.push(lines.slice(i, i + 2).join(" ")); // + next
    if (i + 2 < lines.length) out.push(lines.slice(i, i + 3).join(" ")); // + next two
  }
  return out;
}

/**
 * The real listings: segments carrying at least TWO of {city, price, rooms},
 * deduped by that parsed signature (so a listing captured as line-alone and as
 * line-merged collapses to one).
 */
export function listingCandidates(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const seg of splitIntoListings(text)) {
    const p = parseListing(seg);
    const signals = (p.city != null ? 1 : 0) + (p.price != null ? 1 : 0) + (p.rooms != null ? 1 : 0);
    if (signals < 2) continue;
    const sig = `${p.city ?? "?"}|${p.price ?? "?"}|${p.rooms ?? "?"}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(seg);
  }
  return out;
}

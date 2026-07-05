// Simple duplicate detection: fingerprint from yad2 ID / URL / normalized content.
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

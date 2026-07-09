// Shared logic for the /api/capture endpoint (bookmarklet + Yad2 tab watcher).
// Pure and unit-testable: given the captured page URL, decide the listing
// source, per-source metadata, and which SourceHealth row to credit.
import type { Source, IngestMeta } from "./pipeline";
import { classifyFbUrl } from "./connectors/facebook";

export interface CaptureClassification {
  source: Source;
  meta: IngestMeta;
  /** SourceHealth row to credit for this capture (null = don't track). */
  healthSource: "FACEBOOK" | "YAD2_BROWSER" | null;
}

// A single Yad2 card carries ONE price tag and ONE rooms tag. A capture holding
// several of BOTH is the results grid merged into one blob (tab-watcher < v1.1
// climbed too far up the DOM) — its parsed fields and its URL then belong to
// DIFFERENT apartments, so reject it rather than store a corrupt listing.
// Strict AND: a legit post that merely mentions rooms twice is not rejected.
export function looksLikeMergedYad2Cards(text: string): boolean {
  const priceTags = (text.match(/\d[\d,]{2,}\s*₪/g) || []).length;
  const roomTags = (text.match(/\d+(?:\.\d)?\s*חדרים/g) || []).length;
  return priceTags >= 2 && roomTags >= 2;
}

export function classifyCaptureSource(url: string | null, title: string | null): CaptureClassification {
  if (url && /facebook\.com/i.test(url)) {
    return {
      source: "FACEBOOK",
      meta: { fbSurface: classifyFbUrl(url), fbSourceName: title || null, fbAuthor: null },
      healthSource: "FACEBOOK",
    };
  }
  if (url && /yad2\.co\.il/i.test(url)) {
    // Yad2 listings captured from the user's own browser (tab watcher / bookmarklet).
    return { source: "YAD2", meta: {}, healthSource: "YAD2_BROWSER" };
  }
  return { source: "URL", meta: {}, healthSource: null };
}

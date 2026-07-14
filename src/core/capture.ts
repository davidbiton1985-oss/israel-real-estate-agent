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

// A merged results-grid blob (tab-watcher < v1.1 climbed too far up the DOM)
// bundles MANY apartments, so its parsed fields and URL belong to different
// listings — reject it. Threshold is 3+ of BOTH price and rooms tags: a real
// merged grid shows several of each, whereas a legit single card can carry two
// price tags for an entirely valid reason — a PRICE DROP (old struck-through +
// new price) — which is the highest-value event to capture and must NOT be
// rejected (it would also be marked handled and retired forever by the watcher).
export function looksLikeMergedYad2Cards(text: string): boolean {
  const priceTags = (text.match(/\d[\d,]{2,}\s*₪/g) || []).length;
  const roomTags = (text.match(/\d+(?:\.\d)?\s*חדרים/g) || []).length;
  return priceTags >= 3 && roomTags >= 3;
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

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

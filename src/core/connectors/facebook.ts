// Facebook monitoring — two safe paths, no account risk:
//
//  A) AUTOMATIC: Facebook's own notification emails (from facebookmail.com).
//     Subscribe to groups ("All posts" notifications) and pages; Facebook
//     emails you each post; the existing IMAP watcher polls that inbox every
//     5 minutes. This module parses those notification emails into listing
//     candidates with surface/source/author metadata.
//
//  B) ONE-CLICK CAPTURE: while browsing any Facebook surface (public post,
//     profile, broker page, share, marketplace), a bookmarklet POSTs the
//     selected text + URL to /api/capture — same pipeline, no copy/paste.
//     This module provides the URL→surface classifier for that path too.
//
// Deliberately NOT here: logged-in scraping/headless automation of Facebook.
// No safe way exists (no public API, login-wall, account-ban risk, fragile).

export type FbSurface = "GROUP" | "PAGE" | "PROFILE" | "PUBLIC_POST" | "SHARED" | "MARKETPLACE" | "UNKNOWN";

export interface FbMeta {
  fbSurface: FbSurface;
  fbSourceName: string | null; // group/page name
  fbAuthor: string | null;
}

export interface FbCandidate extends FbMeta {
  postText: string;
  postUrl: string | null;
}

/** Is this email a Facebook notification? (sender-based, facebookmail.com) */
export function isFacebookNotification(fromAddress: string): boolean {
  return /facebookmail\.com|notification.*facebook/i.test(fromAddress);
}

/** Classify a facebook.com URL into the surface it points at. */
export function classifyFbUrl(url: string | null): FbSurface {
  if (!url || !/facebook\.com/i.test(url)) return "UNKNOWN";
  if (/facebook\.com\/(?:groups)\//i.test(url)) return "GROUP";
  if (/facebook\.com\/marketplace\//i.test(url)) return "MARKETPLACE";
  if (/facebook\.com\/share\//i.test(url)) return "SHARED";
  if (/facebook\.com\/profile\.php|facebook\.com\/people\//i.test(url)) return "PROFILE";
  if (/facebook\.com\/pages\//i.test(url)) return "PAGE";
  if (/facebook\.com\/[^/]+\/posts\//i.test(url)) return "PUBLIC_POST"; // page or profile post — indistinguishable from URL
  if (/facebook\.com\/permalink\.php/i.test(url)) return "PUBLIC_POST";
  return "UNKNOWN";
}

/** First facebook.com post/permalink URL in a text blob (notification emails wrap them). */
export function extractFbPostUrl(text: string): string | null {
  const patterns = [
    /https?:\/\/(?:www\.|m\.|l\.)?facebook\.com\/groups\/[^\s"'<>)\]]+/i,
    /https?:\/\/(?:www\.|m\.|l\.)?facebook\.com\/[^\s"'<>)\]]*(?:permalink|posts|story|marketplace|share)[^\s"'<>)\]]*/i,
    /https?:\/\/(?:www\.|m\.|l\.)?facebook\.com\/n\/[^\s"'<>)\]]+/i, // notification redirect links
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

// Subject-line patterns FB uses for group/page notifications (EN + HE).
// Best-effort: unmatched subjects still ingest, just with less metadata.
const SUBJECT_PATTERNS: { re: RegExp; surface: FbSurface; author: number | null; name: number | null }[] = [
  // "דוד כהן פרסם בקבוצה דירות להשכרה בגני תקווה" / "…פרסמה ב־..."
  // NOTE: פרסם ends with FINAL mem (ם) — must alternate, not use פרסמה?
  { re: /^(.+?)\s+(?:פרסם|פרסמה)\s+ב[־-]?קבוצה[:\s]+(.+)$/u, surface: "GROUP", author: 1, name: 2 },
  // "David Cohen posted in Apartments in Ganei Tikva"
  { re: /^(.+?)\s+posted in\s+(.+)$/i, surface: "GROUP", author: 1, name: 2 },
  // "New post in <group>" / "פוסט חדש בקבוצה <group>"
  { re: /^new post in\s+(.+)$/i, surface: "GROUP", author: null, name: 1 },
  { re: /^פוסט חדש בקבוצה\s+(.+)$/u, surface: "GROUP", author: null, name: 1 },
  // "[Group Name] subject…" (legacy bracket style)
  { re: /^\[(.+?)\]/, surface: "GROUP", author: null, name: 1 },
  // "עמוד X פרסם…" / "X shared a post" → page/shared
  { re: /^(.+?)\s+shared a (?:post|link)/i, surface: "SHARED", author: 1, name: null },
  { re: /^(.+?)\s+(?:פרסם|פרסמה)\s+פוסט חדש$/u, surface: "PAGE", author: null, name: 1 },
];

/** Lines in FB notification bodies that are boilerplate, not post content. */
const BOILERPLATE_LINE = new RegExp(
  [
    "facebook\\.com",
    "unsubscribe", "בטל(?:י)? הרשמה", "לביטול", "manage.*notifications", "ניהול התראות",
    "view(?: post| group|)", "הצג(?:ה|)", "צפה בפוסט", "reply to this email", "השב",
    "this message was sent to", "הודעה זו נשלחה", "meta platforms", "^=+$", "^-+$", "^_+$",
  ].join("|"),
  "i"
);

/** Strip notification boilerplate, keep the actual post snippet. */
export function extractPostText(body: string): string {
  return body
    .replace(/https?:\/\/[^\s"'<>)\]]+/g, " ") // URLs are extracted separately — remove inline
    .split("\n")
    .map((l) => l.trim())
    // Long lines with real content survive even if a boilerplate word appears in them;
    // short pure-boilerplate lines ("View post", "unsubscribe", footers) are dropped.
    .filter((l) => l.length > 0 && !(BOILERPLATE_LINE.test(l) && l.length < 60))
    .join("\n")
    .trim()
    .slice(0, 3000);
}

// Facebook emails that are NOT apartment posts — membership confirmations,
// security codes, friend requests, comment/reaction pings, digests. Facebook
// deprecated per-post group emails, so in practice these are the only
// facebookmail emails that arrive; none should become a "listing".
const NON_POST_EMAIL = new RegExp(
  [
    "is your code", "confirm this email", "log ?in", "security",
    "you're now a member", "now a member", "member of", "request to join", "joined the group",
    "friend request", "sent you a friend", "wants to be friends",
    "commented on", "replied to", "reacted to", "liked your", "mentioned you", "tagged you",
    "birthday", "memories", "notifications? (summary|digest)", "see what you missed",
    // Hebrew equivalents
    "הקוד שלך", "אישור", "הצטרפת", "חבר(ה)? בקבוצה", "בקשת(ך)? להצטרף", "בקשת חברות",
    "הגיב", "הגיבה", "הواكن", "תייג", "אזכר", "יום הולדת", "זיכרונות",
  ].join("|"),
  "i"
);

/**
 * Parse one Facebook notification email into a listing candidate.
 * Returns null for non-post emails (membership/security/engagement noise) and
 * when there's not enough text to bother parsing.
 */
export function parseFacebookNotification(subject: string, textBody: string): FbCandidate | null {
  // Reject non-post emails outright so they never become fake listings.
  if (NON_POST_EMAIL.test(subject)) return null;

  let surface: FbSurface = "UNKNOWN";
  let author: string | null = null;
  let sourceName: string | null = null;

  const subj = subject.trim();
  for (const p of SUBJECT_PATTERNS) {
    const m = subj.match(p.re);
    if (m) {
      surface = p.surface;
      author = p.author != null ? m[p.author]?.trim() || null : null;
      sourceName = p.name != null ? m[p.name]?.trim() || null : null;
      break;
    }
  }

  const postUrl = extractFbPostUrl(textBody);
  if (surface === "UNKNOWN") surface = classifyFbUrl(postUrl);

  const postText = extractPostText(textBody);
  // Comment/like/friend-request noise: no real post body → skip.
  if (postText.length < 25) return null;

  return { fbSurface: surface, fbSourceName: sourceName, fbAuthor: author, postText, postUrl };
}

// Review digest — Tier-0 fix for the "silent 79" gap.
//
// A `possible_match` passed every HARD filter (city/price/rooms/deal-type/
// broker rules) but scored below the WhatsApp threshold, usually because a
// benign `capAtPossible` clamp (unknown broker, unmentioned amenity, ≥5 missing
// fields) pinned it to 79. The old pipeline dropped these silently — a DB audit
// found ~2/3 of on-criteria listings never alerted. This batches them into ONE
// low-noise "review" WhatsApp so nothing on-criteria is lost, while the
// immediate strong-match path is left completely untouched.
//
// Dedup ledger: an Alert row with kind "REVIEW_DIGEST" per included match, so a
// listing is surfaced once (a later strong-match still alerts via the normal
// path). No schema migration needed.
import { prisma } from "../lib/db";
import { sendAlert } from "./alert";

const KIND = "REVIEW_DIGEST";
const MAX_ITEMS = 12; // keep one message under Twilio's ~1600-char WhatsApp limit

export interface DigestResult {
  pending: number; // total review-pending matches found
  included: number; // how many made it into this message
  sent: boolean;
  channel: string | null;
  message: string | null;
}

function fmt(n: number | null): string {
  return n == null ? "?" : n.toLocaleString("he-IL");
}

/** Review-pending = active-profile possible_match, not already WhatsApp-alerted, not yet digested. */
export async function findPendingReview() {
  const profile = await prisma.profile.findFirst({ where: { active: true } });
  if (!profile) return { profile: null, matches: [] as Awaited<ReturnType<typeof queryMatches>> };
  const minScore = Number(process.env.REVIEW_MIN_SCORE ?? profile.dashboardThreshold ?? 60);
  const matches = await queryMatches(profile.id, minScore);
  return { profile, matches };
}

async function queryMatches(profileId: string, minScore: number) {
  return prisma.match.findMany({
    where: {
      profileId,
      status: "possible_match",
      score: { gte: minScore },
      alerted: false, // never already WhatsApp'd as a strong match
      alerts: { none: { kind: KIND } }, // not yet in a prior digest
    },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    include: { listing: { select: { source: true, city: true, neighborhood: true, price: true, rooms: true, url: true, brokerStatus: true } } },
  });
}

function buildMessage(matches: Awaited<ReturnType<typeof queryMatches>>): { text: string; included: number } {
  const shown = matches.slice(0, MAX_ITEMS);
  const lines = shown.map((m, i) => {
    const l = m.listing;
    const where = [l.city, l.neighborhood].filter(Boolean).join(" · ") || "מיקום לא ברור";
    const head = `${i + 1}. ${where} · ${fmt(l.rooms)} חד' · ${fmt(l.price)} ₪ · ציון ${m.score}`;
    return l.url ? `${head}\n   ${l.url}` : head;
  });
  const more = matches.length - shown.length;
  const header = `🔎 ${matches.length} דירות לבדיקה — עברו את כל הסינון הקשיח אבל לא הגיעו לסף התראה מלאה. שווה לעבור עליהן:`;
  const footer = more > 0 ? `\n\n… ועוד ${more} בלוח.` : "";
  return { text: `${header}\n\n${lines.join("\n\n")}${footer}`, included: shown.length };
}

/**
 * Build and (optionally) send the review digest. `dryRun` routes to console and
 * does NOT write ledger rows, so it can be previewed repeatedly without
 * consuming the backlog. A real run marks every included match as digested.
 */
export async function runReviewDigest(opts: { dryRun?: boolean } = {}): Promise<DigestResult> {
  const { matches } = await findPendingReview();
  if (matches.length === 0) {
    return { pending: 0, included: 0, sent: false, channel: null, message: null };
  }
  const { text, included } = buildMessage(matches);

  if (opts.dryRun) {
    console.log("\n===== 🔎 REVIEW DIGEST (dry-run — not sent, ledger untouched) =====\n" + text + "\n==============================================================\n");
    return { pending: matches.length, included, sent: false, channel: "console(dry-run)", message: text };
  }

  const res = await sendAlert(text);
  // Mark exactly the matches shown in THIS message as digested (the "… ועוד" tail
  // remains pending and rolls into the next run).
  const shown = matches.slice(0, included);
  await prisma.alert.createMany({
    data: shown.map((m) => ({
      matchId: m.id,
      kind: KIND,
      channel: res.channel,
      status: res.status,
      reason: "REVIEW",
      message: `review digest (score ${m.score})`,
      sentAt: res.status === "SENT" ? new Date() : null,
    })),
  });
  return { pending: matches.length, included, sent: res.status === "SENT", channel: res.channel, message: text };
}

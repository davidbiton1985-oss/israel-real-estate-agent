// Tier-0 "absence-of-signal" safety net.
//
// The existing watchdogs are PRESENCE-of-failure alarms: they need the system
// healthy enough to notice a stale sensor and send. They can't catch total
// death (Mac asleep, server wedged, Twilio broken) — the 22h-blind-spot class.
// Two inverse controls live here:
//   1. buildDailyHeartbeat / a once-a-day "I'm alive + here's 24h of activity"
//      WhatsApp whose SILENCE is the alarm.
//   2. pingHealthcheck — an external dead-man's switch (healthchecks.io or any
//      URL) hit every scheduler tick; the external service alerts David via an
//      independent channel if the pings stop. Covers the case where the Mac /
//      server / Twilio is dead and cannot alert about itself.
import { prisma } from "../lib/db";

const STALE_MS = 45 * 60000;

/**
 * External dead-man's switch. No-op unless HEALTHCHECK_URL is set. Pings ONLY
 * when every browser sensor that has ever reported is currently FRESH — so the
 * external monitor (e.g. healthchecks.io) alarms on COVERAGE loss (a stale
 * sensor), not merely on the scheduler process dying. This alarm path is
 * independent of Twilio AND the Mac, so it fires even when the in-app watchdogs
 * cannot (they share the Mac/Twilio they're trying to report on).
 */
export async function pingHealthcheck(): Promise<void> {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return;
  try {
    const [y, f] = await Promise.all([
      prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } }),
      prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } }),
    ]);
    const everSucceeded = [y, f].filter((h): h is NonNullable<typeof h> => !!h?.lastSuccessAt);
    const allFresh = everSucceeded.length > 0 && everSucceeded.every((h) => Date.now() - h.lastSuccessAt!.getTime() < STALE_MS);
    if (allFresh) await fetch(url, { method: "GET" });
    // else: skip the ping → the monitor's grace period elapses → external alarm.
  } catch {
    /* never let a monitoring ping break the tick */
  }
}

async function ageMin(source: string): Promise<number | null> {
  const h = await prisma.sourceHealth.findUnique({ where: { source } });
  return h?.lastSuccessAt ? Math.round((Date.now() - h.lastSuccessAt.getTime()) / 60000) : null;
}

/** One-line-per-fact daily summary. Its non-arrival is the real alarm. */
export async function buildDailyHeartbeat(): Promise<string> {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [yad2, fb, email, alerts, reviewPending] = await Promise.all([
    prisma.listing.count({ where: { source: "YAD2", createdAt: { gte: since } } }),
    prisma.listing.count({ where: { source: "FACEBOOK", createdAt: { gte: since } } }),
    prisma.listing.count({ where: { source: "EMAIL", createdAt: { gte: since } } }),
    prisma.alert.count({ where: { kind: "MATCH_ALERT", status: "SENT", createdAt: { gte: since } } }),
    prisma.match.count({ where: { status: "possible_match", alerted: false, alerts: { none: { kind: "REVIEW_DIGEST" } } } }),
  ]);
  const [yAge, fAge] = await Promise.all([ageMin("YAD2_BROWSER"), ageMin("FACEBOOK")]);
  const fmtAge = (m: number | null) => (m == null ? "אף פעם" : `${m} ד'`);

  // The day's CLOSEST MISS — turns a zero-alert day from anxiety into
  // evidence: "the best thing out there was a 74 over budget" reads as a
  // quiet market; a 79 with one weakness reads as "maybe lower the bar".
  const closest = await prisma.match.findFirst({
    where: { alerted: false, createdAt: { gte: since }, profile: { active: true } },
    orderBy: { score: "desc" },
    include: { listing: { select: { city: true, price: true } } },
  });
  let closestLine: string | null = null;
  if (closest && closest.score > 0) {
    let why = "";
    try {
      const neg = JSON.parse(closest.reasonsNegative || "[]");
      if (Array.isArray(neg) && neg[0]) why = ` (${neg[0]})`;
    } catch {}
    closestLine = `הכי קרוב היום: ציון ${closest.score} — ${closest.listing.city ?? "?"} · ${
      closest.listing.price != null ? `${closest.listing.price.toLocaleString()} ₪` : "מחיר לא צוין"
    }${why}`;
  }

  const lines = [
    "✅ בוטון פעיל (סיכום 24 שעות)",
    `נקלטו: Yad2 ${yad2} · פייסבוק ${fb} · מייל ${email}`,
    `התראות שנשלחו: ${alerts} · ממתינות לבדיקה: ${reviewPending}`,
    ...(closestLine ? [closestLine] : []),
    `חיישנים — קליטה אחרונה: Yad2 ${fmtAge(yAge)} · פייסבוק ${fmtAge(fAge)}`,
  ];
  // "Alive-but-blind" flag: a sensor that's heartbeating (fresh) yet captured
  // NOTHING in 24h is the signature of extraction rot (a DOM/selector change) —
  // it looks identical to a quiet market, so surface it softly for a glance
  // rather than staying invisibly green.
  const fresh = (m: number | null) => m != null && m < 45;
  if (fresh(yAge) && yad2 === 0) lines.push("⚠️ Yad2 חי אך 0 קליטות ב-24ש — בדוק שהטאב מציג מודעות");
  if (fresh(fAge) && fb === 0) lines.push("⚠️ פייסבוק חי אך 0 קליטות ב-24ש — בדוק את הקורא");
  lines.push("(אם ההודעה הזו לא הגיעה בבוקר — משהו במערכת מת, בדוק אותה)");
  return lines.join("\n");
}

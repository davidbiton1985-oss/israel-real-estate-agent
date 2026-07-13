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

/** Fire-and-forget external heartbeat. No-op unless HEALTHCHECK_URL is set. */
export async function pingHealthcheck(): Promise<void> {
  const url = process.env.HEALTHCHECK_URL;
  if (!url) return;
  try {
    await fetch(url, { method: "GET" });
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
  return [
    "✅ RE-Agent פעיל (סיכום 24 שעות)",
    `נקלטו: Yad2 ${yad2} · פייסבוק ${fb} · מייל ${email}`,
    `התראות שנשלחו: ${alerts} · ממתינות לבדיקה: ${reviewPending}`,
    `חיישנים — קליטה אחרונה: Yad2 ${fmtAge(yAge)} · פייסבוק ${fmtAge(fAge)}`,
    "(אם ההודעה הזו לא הגיעה בבוקר — משהו במערכת מת, בדוק אותה)",
  ].join("\n");
}

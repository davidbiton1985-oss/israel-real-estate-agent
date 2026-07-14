// Facebook reader watchdog — runs every 30 min via launchd (com.david.fb-watchdog).
// The #re-agent notifications tab is the ONLY Facebook sensor; it goes silent if
// the tab is closed, loses its per-tab reader designation (sessionStorage clears
// on close/restart), or sits on a checkpoint — and that once cost ~22h of blind
// coverage. When the Mac is on but Facebook hasn't delivered for 45+ minutes
// during waking hours, send ONE WhatsApp nudge (deduped to once per 6h).
//
// Mirrors ops/yad2-watchdog.ts; kept as a separate unit so each sensor is
// independent. Cooldown is scoped by reason so the two watchdogs don't suppress
// each other.
import { readFileSync } from "fs";
import { execFile } from "child_process";
import { prisma } from "../src/lib/db";
import { sendAlert } from "../src/core/alert";

const READER_URL = "https://www.facebook.com/notifications#re-agent";

// Self-heal: reopen the reader tab. The #re-agent hash makes the new tab claim
// the localStorage lease and resume, which recovers the common outage classes
// (Mac woke and the tab didn't resume, tab closed, Chrome discarded it) WITHOUT
// bothering David. A CAPTCHA is the one case this can't fix — that still escalates.
function reopenReaderTab(): Promise<void> {
  return new Promise((resolve) => {
    execFile("open", ["-a", "Google Chrome", READER_URL], () => resolve());
  });
}

// Standalone tsx doesn't load .env into process.env — load it explicitly
// before doing anything (the Next server loads .env natively; scripts don't).
function loadEnv() {
  try {
    const env = readFileSync(".env", "utf8"); // launchd cd's to the repo root
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env optional — server env may already carry the vars */
  }
}

const STALE_MINUTES = 45; // > the 7–12 min daytime scan cadence + queue work
const NUDGE_COOLDOWN_H = 6;
const SELFHEAL_WINDOW_MIN = 50; // > the 30-min watchdog interval, so the next run escalates rather than re-reopening

async function main() {
  loadEnv();
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 24) return console.log("[fb-watchdog] night — skipping");

  const h = await prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } });
  const ageMin = h?.lastSuccessAt ? (Date.now() - h.lastSuccessAt.getTime()) / 60000 : Infinity;
  if (ageMin < STALE_MINUTES) return console.log(`[fb-watchdog] facebook healthy (${Math.round(ageMin)}m ago)`);

  const lastNudge = await prisma.alert.findFirst({ where: { kind: "WATCHDOG", reason: "FB_STALE" }, orderBy: { createdAt: "desc" } });
  if (lastNudge && Date.now() - lastNudge.createdAt.getTime() < NUDGE_COOLDOWN_H * 3600_000) {
    return console.log("[fb-watchdog] stale but already nudged recently");
  }

  // Escalation: first stale detection → silently auto-reopen the tab and give it
  // ~one watchdog cycle to resume. Only if a reopen was already tried recently
  // and it's STILL stale (the reopen didn't help → almost certainly a CAPTCHA)
  // do we bother David. So a Mac-woke/tab-dropped outage self-heals unattended.
  const lastHeal = await prisma.alert.findFirst({ where: { kind: "WATCHDOG", reason: "FB_SELFHEAL" }, orderBy: { createdAt: "desc" } });
  const healedRecently = lastHeal && Date.now() - lastHeal.createdAt.getTime() < SELFHEAL_WINDOW_MIN * 60000;
  if (!healedRecently) {
    await reopenReaderTab();
    await prisma.alert.create({
      data: { kind: "WATCHDOG", channel: "none", status: "SENT", reason: "FB_SELFHEAL", message: "auto-reopened the reader tab (self-heal); escalate only if still stale next cycle", sentAt: new Date() },
    });
    return console.log(`[fb-watchdog] stale ${Math.round(ageMin)}m → auto-reopened reader tab; will escalate next cycle if unresolved`);
  }

  const ageText = ageMin === Infinity ? "אף פעם" : `לפני ${Math.round(ageMin)} דקות`;
  const msg = [
    "⚠️ קורא הפייסבוק לא פעיל",
    `הקליטה האחרונה מפייסבוק הייתה ${ageText} — כנראה הטאב נסגר או איבד את סימון ה-reader.`,
    "פתח מחדש את טאב ההתראות עם הסימון בסוף ה-URL (ואז רענן):",
    "https://www.facebook.com/notifications#re-agent",
    "(אם מופיע עמוד אימות — פתור אותו והסריקה תתחדש)",
  ].join("\n");

  const r = await sendAlert(msg);
  await prisma.alert.create({
    data: {
      kind: "WATCHDOG",
      channel: r.channel,
      status: r.status,
      reason: "FB_STALE",
      message: msg,
      error: r.error ?? null,
      sentAt: r.status === "SENT" ? new Date() : null,
    },
  });
  console.log(`[fb-watchdog] nudge sent via ${r.channel} (facebook stale ${Math.round(ageMin)}m)`);
}

main()
  .catch((e) => {
    console.error("[fb-watchdog]", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

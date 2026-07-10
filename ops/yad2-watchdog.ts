// Yad2 tab watchdog — runs every 30 min via launchd (com.david.yad2-watchdog).
// The Yad2 pinned tab is the ONLY Yad2 sensor; if it's closed, coverage stops
// silently (a real ₪8,600 in-budget apartment was missed this way). When the
// Mac is on but the tab hasn't delivered for 45+ minutes during waking hours,
// send ONE WhatsApp nudge (deduped to once per 6h).
import { readFileSync } from "fs";

// Standalone tsx doesn't load .env into process.env — do it explicitly so
// Twilio credentials are available outside the Next.js server. The launchd
// job cd's to the repo root first, so the relative path is always right
// (NOT __dirname — undefined under tsx's ESM transform, and the silent catch
// masked exactly that on the first run).
try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  /* .env optional — server env may already carry the vars */
}

import { prisma } from "../src/lib/db";
import { sendAlert } from "../src/core/alert";

const STALE_MINUTES = 45;
const NUDGE_COOLDOWN_H = 6;

async function main() {
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 24) return console.log("[watchdog] night — skipping");

  const h = await prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } });
  const ageMin = h?.lastSuccessAt ? (Date.now() - h.lastSuccessAt.getTime()) / 60000 : Infinity;
  if (ageMin < STALE_MINUTES) return console.log(`[watchdog] yad2 healthy (${Math.round(ageMin)}m ago)`);

  const lastNudge = await prisma.alert.findFirst({ where: { kind: "WATCHDOG" }, orderBy: { createdAt: "desc" } });
  if (lastNudge && Date.now() - lastNudge.createdAt.getTime() < NUDGE_COOLDOWN_H * 3600_000) {
    return console.log("[watchdog] stale but already nudged recently");
  }

  const ageText = ageMin === Infinity ? "אף פעם" : `לפני ${Math.round(ageMin)} דקות`;
  const msg = [
    "⚠️ טאב יד2 לא פעיל",
    `הקליטה האחרונה מיד2 הייתה ${ageText} — כנראה הטאב הנעוץ סגור.`,
    "פתח אותו כדי שהסריקה תמשיך (מיון: מהחדש לישן):",
    "https://www.yad2.co.il/realestate/rent",
  ].join("\n");

  const r = await sendAlert(msg);
  await prisma.alert.create({
    data: {
      kind: "WATCHDOG",
      channel: r.channel,
      status: r.status,
      reason: "YAD2_STALE",
      message: msg,
      error: r.error ?? null,
      sentAt: r.status === "SENT" ? new Date() : null,
    },
  });
  console.log(`[watchdog] nudge sent via ${r.channel} (yad2 stale ${Math.round(ageMin)}m)`);
}

main()
  .catch((e) => {
    console.error("[watchdog]", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

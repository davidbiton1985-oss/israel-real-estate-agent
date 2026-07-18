// Yad2 tab watchdog — runs every 30 min via launchd (com.david.yad2-watchdog).
// The Yad2 pinned tab is the ONLY Yad2 sensor; if it's closed, coverage stops
// silently (a real ₪8,600 in-budget apartment was missed this way). When the
// Mac is on but the tab hasn't delivered for 45+ minutes during waking hours,
// send ONE WhatsApp nudge (deduped to once per 6h).
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { sendAlert } from "../src/core/alert";

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

const STALE_MINUTES = 45;
const NUDGE_COOLDOWN_H = 6;

async function main() {
  loadEnv();
  const hour = new Date().getHours();
  if (hour < 8 || hour >= 24) return console.log("[watchdog] night — skipping");

  const h = await prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } });
  const ageMin = h?.lastSuccessAt ? (Date.now() - h.lastSuccessAt.getTime()) / 60000 : Infinity;
  if (ageMin < STALE_MINUTES) return console.log(`[watchdog] yad2 healthy (${Math.round(ageMin)}m ago)`);

  // Scope the cooldown to THIS source's reason — the parallel FB watchdog also
  // writes kind:"WATCHDOG", and an unscoped query would let an FB nudge suppress
  // a Yad2 nudge (and vice versa).
  const lastNudge = await prisma.alert.findFirst({ where: { kind: "WATCHDOG", reason: "YAD2_STALE" }, orderBy: { createdAt: "desc" } });
  if (lastNudge && Date.now() - lastNudge.createdAt.getTime() < NUDGE_COOLDOWN_H * 3600_000) {
    return console.log("[watchdog] stale but already nudged recently");
  }

  const fb = await prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } });
  const fAgeMin = fb?.lastSuccessAt ? Math.round((Date.now() - fb.lastSuccessAt.getTime()) / 60000) : null;
  const ageText = ageMin === Infinity ? "מעולם" : `${Math.round(ageMin)} דקות`;
  const msg = [
    "⚠️ יד2 שקט — הטאב כנראה סגור או תקוע",
    `עיוור מיד2 כבר ${ageText}.`,
    "פתח/רענן את הטאב הנעוץ של יד2 בכרום (החיפוש השמור עם הסינונים שלך).",
    fAgeMin != null && fAgeMin < 45
      ? `בינתיים: פייסבוק ממשיך לקלוט (קליטה אחרונה לפני ${fAgeMin} ד׳).`
      : "שים לב: גם פייסבוק לא מעודכן — ייתכן שכרום או המחשב כבויים.",
    "https://www.yad2.co.il/realestate/rent",
  ].join("\n");

  // System messages share one tag: consecutive nudges coalesce to one card.
  const r = await sendAlert(msg, { tag: "re-agent-system" });
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

// Runner for the once-a-day "I'm alive" WhatsApp (launchd: com.david.daily-heartbeat).
// Its SILENCE is the alarm — if it doesn't arrive, the whole box is likely dark.
// Pass --dry-run to preview without sending.
import { readFileSync } from "fs";
import { buildDailyHeartbeat } from "../src/core/systemStatus";
import { sendAlert } from "../src/core/alert";
import { cleanupListingImages } from "../src/core/images";
import { prisma } from "../src/lib/db";

function loadEnv() {
  try {
    const env = readFileSync(".env", "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env optional */
  }
}

async function main() {
  loadEnv();
  const msg = await buildDailyHeartbeat();
  if (process.argv.includes("--dry-run")) {
    console.log("\n===== ✅ DAILY HEARTBEAT (dry-run) =====\n" + msg + "\n=======================================\n");
    return;
  }
  // Ambient: arrives silently — the heartbeat is morning-coffee reading, not
  // an interruption; its NON-arrival is the real alarm.
  const r = await sendAlert(msg, { ambient: true });
  console.log(`[daily-heartbeat] sent via ${r.channel} (${r.status})`);

  // Daily photo housekeeping: expired/orphan listing photos leave the disk
  // (pursued apartments keep theirs; DB only ever holds the path string).
  const clean = await cleanupListingImages();
  console.log(`[daily-heartbeat] image cleanup: ${clean.deleted}/${clean.scanned} deleted`);
}

main()
  .catch((e) => {
    console.error("[daily-heartbeat]", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

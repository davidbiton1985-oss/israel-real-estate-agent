// The 5-minute automatic-discovery watcher. Each tick:
//   1. Polls enabled sources (email inbox with Yad2/portal saved-search alerts)
//   2. Ingests new items: parse → dedup → score → WhatsApp for strong matches
//   3. Processes any leftover unscanned listings (manual paste, seed data)
//   4. Records per-source health (shown on the dashboard)
// Run with: npm run scheduler   (keep it running in a terminal / launchd)
import { pollSources } from "../src/core/poll";
import { pingHealthcheck } from "../src/core/systemStatus";
import { prisma } from "../src/lib/db";

const intervalMin = Number(process.env.SCAN_INTERVAL_MIN ?? "5");

async function tick() {
  try {
    const s = await pollSources();
    const emailPart = s.emailConfigured
      ? s.emailOk
        ? `email: ${s.emailsSeen} new email(s) → ${s.listingsIngested} listing(s) (${s.newListings} new)`
        : `email: ERROR ${s.emailError}`
      : "email: not configured";
    console.log(
      `[watcher ${new Date().toISOString()}] ${emailPart} · leftovers scanned: ${s.scannedLeftovers} · alerts sent: ${s.alertsSent}`
    );
    // Dead-man's switch: only ping AFTER a clean tick, so a wedged poll stops the
    // pings and the external monitor (healthchecks.io) raises the alarm.
    await pingHealthcheck();
  } catch (e) {
    console.error("[watcher] tick failed:", e);
  }
}

console.log(`Automatic-discovery watcher started — polling every ${intervalMin} minute(s). Ctrl+C to stop.`);
tick();
const timer = setInterval(tick, intervalMin * 60 * 1000);

process.on("SIGINT", async () => {
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
});

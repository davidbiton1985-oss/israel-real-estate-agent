// 5-minute polling foundation.
// MVP: no live external polling (by design — no Yad2/Facebook scraping).
// This loop processes any queued/unscanned listings (e.g. demo or future safe connectors)
// every SCAN_INTERVAL_MIN minutes. Real safe connectors (user-assisted email/alert,
// browser-assisted capture) plug into the same runScan() pipeline later.
import { runScan } from "../src/core/pipeline";
import { prisma } from "../src/lib/db";

const intervalMin = Number(process.env.SCAN_INTERVAL_MIN ?? "5");

async function tick() {
  try {
    const result = await runScan();
    console.log(
      `[scheduler ${new Date().toISOString()}] scanned ${result.processed} pending listing(s), ${result.matchesCreated} match evaluation(s)`
    );
  } catch (e) {
    console.error("[scheduler] scan failed:", e);
  }
}

console.log(`Scheduler started — scanning every ${intervalMin} minute(s). Ctrl+C to stop.`);
tick();
const timer = setInterval(tick, intervalMin * 60 * 1000);

process.on("SIGINT", async () => {
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
});

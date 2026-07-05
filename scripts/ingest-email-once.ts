// One-shot email-ingestion run for setup validation:
//   npm run ingest:email
// Connects to the configured IMAP inbox, processes unseen alert emails through
// the full pipeline, prints what happened, and exits.
import { pollSources } from "../src/core/poll";
import { prisma } from "../src/lib/db";

(async () => {
  const s = await pollSources();
  if (!s.emailConfigured) {
    console.log("IMAP is not configured — set IMAP_HOST / IMAP_USER / IMAP_PASS in .env (see README).");
  } else if (!s.emailOk) {
    console.log("Email poll FAILED:", s.emailError);
  } else {
    console.log(`Email poll OK: ${s.emailsSeen} unseen email(s) → ${s.listingsIngested} listing(s) ingested (${s.newListings} new).`);
  }
  console.log(`Leftover listings scanned: ${s.scannedLeftovers} · alerts sent this run: ${s.alertsSent}`);
  await prisma.$disconnect();
})();

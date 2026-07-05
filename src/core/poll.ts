// The automatic-discovery tick: poll every enabled source connector, feed new
// items through the normal pipeline (parse → dedup → score → alert), record
// per-source health, then process any leftover unscanned listings.
// Called by the 5-minute scheduler AND by the dashboard's "Run scan now".
import { prisma } from "../lib/db";
import { ingestAndMatch, runScan } from "./pipeline";
import { pollEmailInbox, emailConfigVars } from "./connectors/email";

export interface PollSummary {
  emailConfigured: boolean;
  emailOk: boolean;
  emailError?: string;
  emailsSeen: number;
  listingsIngested: number;
  newListings: number;
  alertsSent: number;
  scannedLeftovers: number;
}

async function recordHealth(
  source: string,
  ok: boolean,
  error: string | undefined,
  itemsFound: number,
  newListings: number
) {
  const existing = await prisma.sourceHealth.findUnique({ where: { source } });
  await prisma.sourceHealth.upsert({
    where: { source },
    create: {
      source,
      lastCheckAt: new Date(),
      lastSuccessAt: ok ? new Date() : null,
      lastError: ok ? null : (error ?? "unknown error"),
      consecutiveErrors: ok ? 0 : 1,
      lastItemsFound: itemsFound,
      lastNewListings: newListings,
      totalIngested: newListings,
    },
    update: {
      enabled: true, // configured connectors are re-enabled if previously marked unconfigured
      lastCheckAt: new Date(),
      ...(ok
        ? { lastSuccessAt: new Date(), lastError: null, consecutiveErrors: 0 }
        : { lastError: error ?? "unknown error", consecutiveErrors: (existing?.consecutiveErrors ?? 0) + 1 }),
      lastItemsFound: itemsFound,
      lastNewListings: newListings,
      totalIngested: (existing?.totalIngested ?? 0) + newListings,
    },
  });
}

/** One full automatic-discovery pass. Never throws. */
export async function pollSources(): Promise<PollSummary> {
  const summary: PollSummary = {
    emailConfigured: emailConfigVars().configured,
    emailOk: false,
    emailsSeen: 0,
    listingsIngested: 0,
    newListings: 0,
    alertsSent: 0,
    scannedLeftovers: 0,
  };

  // --- Email connector (the first real automatic source) ---
  if (summary.emailConfigured) {
    const poll = await pollEmailInbox();
    summary.emailOk = poll.ok;
    summary.emailError = poll.error;
    summary.emailsSeen = poll.itemsFound;

    for (const item of poll.items) {
      try {
        const result = await ingestAndMatch(item.rawText, item.source, item.url);
        summary.listingsIngested++;
        if (result.isNew) summary.newListings++;
        summary.alertsSent += result.alertsSent;
      } catch (e) {
        console.error("[poll] failed to ingest email item:", e instanceof Error ? e.message : e);
      }
    }
    await recordHealth("EMAIL", poll.ok, poll.error, poll.itemsFound, summary.newListings);
  } else {
    // Not configured is a setup state, not an error — don't accumulate error counts.
    await prisma.sourceHealth.upsert({
      where: { source: "EMAIL" },
      create: {
        source: "EMAIL",
        enabled: false,
        lastCheckAt: new Date(),
        lastError: `not configured (missing: ${emailConfigVars().missing.join(", ")})`,
      },
      update: {
        enabled: false,
        lastCheckAt: new Date(),
        lastError: `not configured (missing: ${emailConfigVars().missing.join(", ")})`,
        consecutiveErrors: 0,
      },
    });
  }

  // --- Leftovers: anything unscanned (manual paste from UI, demo seed, etc.) ---
  try {
    const scan = await runScan();
    summary.scannedLeftovers = scan.processed;
    summary.alertsSent += scan.alertsSent;
  } catch (e) {
    console.error("[poll] leftover scan failed:", e instanceof Error ? e.message : e);
  }

  return summary;
}

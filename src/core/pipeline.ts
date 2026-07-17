// Ingestion + scan pipeline: parse → fingerprint/dedup(update-in-place) → store →
// score vs profiles → decide + send alerts (new match / price-drop / material-change / suppressed).
import { prisma } from "../lib/db";
import { parseListing } from "./parser";
import { fingerprint, isLikelyDuplicateText } from "./dedup";
import { scoreListing } from "./matching";
import { buildAlertMessage, buildPriceDropMessage, buildMaterialChangeMessage, sendAlert, decideAlertAction } from "./alert";
import type { Listing } from "@prisma/client";

export type Source = "YAD2" | "FACEBOOK" | "WHATSAPP" | "MANUAL" | "URL" | "DEMO" | "EMAIL";

/** Optional per-source metadata (currently Facebook surface/source/author). */
export interface IngestMeta {
  fbSurface?: string | null;
  fbSourceName?: string | null;
  fbAuthor?: string | null;
}

export interface IngestResult {
  listing: Listing;
  isNew: boolean;
  priceChanged: boolean;
  oldPrice: number | null;
}

function materialSnapshot(listing: Listing): string {
  return JSON.stringify({
    rooms: listing.rooms,
    balcony: listing.balcony,
    parking: listing.parking,
    brokerStatus: listing.brokerStatus,
  });
}

/**
 * Parse a raw pasted listing and store it. If the same listing (matched by
 * Yad2 ID → URL → content fingerprint) already exists, it is UPDATED IN PLACE
 * rather than creating a new duplicate row — a price change is recorded in
 * priceHistory so the matching step can fire a price-drop re-alert.
 */
export async function ingestListing(rawText: string, source: Source, url: string | null, meta: IngestMeta = {}): Promise<IngestResult> {
  const parsed = parseListing(rawText, url);
  const fp = fingerprint(parsed, rawText, url);
  const existing = await prisma.listing.findFirst({ where: { fingerprint: fp } });

  const metaData = {
    fbSurface: meta.fbSurface ?? null,
    fbSourceName: meta.fbSourceName ?? null,
    fbAuthor: meta.fbAuthor ?? null,
  };
  const parsedData = {
    dealType: parsed.dealType,
    city: parsed.city,
    neighborhood: parsed.neighborhood,
    street: parsed.street,
    price: parsed.price,
    rooms: parsed.rooms,
    sizeSqm: parsed.sizeSqm,
    floor: parsed.floor,
    totalFloors: parsed.totalFloors,
    balcony: parsed.balcony,
    parking: parsed.parking,
    elevator: parsed.elevator,
    mamad: parsed.mamad,
    storage: parsed.storage,
    garden: parsed.garden,
    condition: parsed.condition,
    furnished: parsed.furnished,
    propertyType: parsed.propertyType,
    entryImmediate: parsed.entryImmediate,
    entryFlexible: parsed.entryFlexible,
    entryDate: parsed.entryDate,
    arnonaMonthly: parsed.arnonaMonthly,
    vaadMonthly: parsed.vaadMonthly,
    brokerStatus: parsed.brokerStatus,
    brokerConfidence: parsed.brokerConfidence,
    brokerEvidence: parsed.brokerEvidence,
    brokerFeeStatus: parsed.brokerFeeStatus,
    brokerFeeText: parsed.brokerFeeText,
    yad2ListingId: parsed.yad2ListingId,
  };

  if (!existing) {
    // Exact-text backstop FIRST: the identical rawText under a different URL is
    // always the same apartment (repost / cross-attribution) — price-less posts
    // skipped the fuzzy check below and double-alerted.
    let fuzzyDuplicateOf: string | null = null;
    const exactText = await prisma.listing.findFirst({
      where: { rawText, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      orderBy: { createdAt: "desc" },
    });
    if (exactText) fuzzyDuplicateOf = exactText.id;

    // No exact fingerprint match. Fall back to fuzzy text similarity against
    // recent listings sharing city + a close price (and rooms, if known) —
    // catches reposts/reshares with no shared URL/Yad2 ID (Yad2→Facebook, FB reshares).
    if (!fuzzyDuplicateOf && parsed.city && parsed.price != null) {
      const candidates = await prisma.listing.findMany({
        where: {
          city: parsed.city,
          price: { gte: Math.round(parsed.price * 0.97), lte: Math.round(parsed.price * 1.03) },
          ...(parsed.rooms != null ? { rooms: parsed.rooms } : {}),
        },
        take: 25,
        orderBy: { createdAt: "desc" },
      });
      for (const c of candidates) {
        if (isLikelyDuplicateText(rawText, c.rawText)) {
          fuzzyDuplicateOf = c.id;
          break;
        }
      }
    }

    const listing = await prisma.listing.create({
      data: { source, url, rawText, fingerprint: fp, isDuplicateOf: fuzzyDuplicateOf, priceHistory: "[]", ...metaData, ...parsedData },
    });
    return { listing, isNew: true, priceChanged: false, oldPrice: null };
  }

  const oldPrice = existing.price;
  const priceChanged = parsed.price != null && oldPrice != null && parsed.price !== oldPrice;

  let history: { amount: number; seenAt: string }[] = [];
  try {
    history = JSON.parse(existing.priceHistory || "[]");
  } catch {
    history = [];
  }
  if (priceChanged && oldPrice != null) {
    history.push({ amount: oldPrice, seenAt: existing.createdAt.toISOString() });
  }

  const listing = await prisma.listing.update({
    where: { id: existing.id },
    data: {
      source,
      url: url ?? existing.url,
      rawText,
      priceHistory: JSON.stringify(history),
      scanned: false, // force re-match so price-drop/material-change can be evaluated
      // keep earlier FB metadata if the re-paste lacks it
      fbSurface: metaData.fbSurface ?? existing.fbSurface,
      fbSourceName: metaData.fbSourceName ?? existing.fbSourceName,
      fbAuthor: metaData.fbAuthor ?? existing.fbAuthor,
      ...parsedData,
    },
  });

  return { listing, isNew: false, priceChanged, oldPrice };
}

export interface MatchSummary {
  matchesCreated: number;
  alertsSent: number;
  priceDropFired: boolean;
  materialChangeFired: boolean;
  suppressedCount: number;
}

/** Score one listing against all active profiles; create/refresh matches; act on the alert lifecycle. */
export async function matchListing(listing: Listing): Promise<MatchSummary> {
  const profiles = await prisma.profile.findMany({ where: { active: true } });
  const summary: MatchSummary = { matchesCreated: 0, alertsSent: 0, priceDropFired: false, materialChangeFired: false, suppressedCount: 0 };
  let deliveryFailed = false; // any Twilio-attempted send that fell back to console

  for (const profile of profiles) {
    const result = scoreListing(profile, listing);
    const scoreFields = {
      score: result.score,
      status: result.status,
      reasonsPositive: JSON.stringify(result.reasonsPositive),
      reasonsNegative: JSON.stringify(result.reasonsNegative),
      missingFields: JSON.stringify(result.missingFields),
      redFlags: JSON.stringify(result.redFlags),
      recommendedAction: result.recommendedAction,
    };
    const match = await prisma.match.upsert({
      where: { profileId_listingId: { profileId: profile.id, listingId: listing.id } },
      update: scoreFields, // re-scan must refresh score/status — fixes a Phase1/2 no-op bug
      create: { profileId: profile.id, listingId: listing.id, ...scoreFields },
    });
    summary.matchesCreated++;

    const currentSnapshot = materialSnapshot(listing);
    const action = decideAlertAction({
      scoreQualifies: result.score >= profile.whatsappThreshold,
      isDuplicate: Boolean(listing.isDuplicateOf),
      // MUST be the boolean flag — NOT `lastAlertedPrice != null`: a price-less
      // listing keeps lastAlertedPrice null after alerting, which re-fired the
      // same "new match" WhatsApp on every watcher cycle (seen: 200×/post).
      alreadyAlertedBefore: match.alerted,
      lastAlertedPrice: match.lastAlertedPrice,
      currentPrice: listing.price,
      priceDropReAlert: profile.priceDropReAlert,
      lastAlertedSnapshot: match.lastAlertedSnapshot,
      currentSnapshot,
    });

    if (action === "NONE") continue;

    if (action === "SUPPRESSED") {
      summary.suppressedCount++;
      const reason = listing.isDuplicateOf ? "DUPLICATE_SUPPRESSED" : "NO_CHANGE_SUPPRESSED";
      // Record each suppression ONCE, not per scan cycle: a listing that stays
      // visible on Yad2 is re-captured every ~20 min and used to append an
      // identical row each time (36+/day per match), drowning the real alert
      // history. Skip the write when the match's latest alert already says
      // the same thing; a suppression after a SENT (or a reason change) still
      // gets its row.
      const last = await prisma.alert.findFirst({
        where: { matchId: match.id },
        orderBy: { createdAt: "desc" },
        select: { status: true, reason: true },
      });
      if (last?.status === "SUPPRESSED" && last.reason === reason) continue;
      await prisma.alert.create({
        data: {
          matchId: match.id,
          kind: "MATCH_ALERT",
          channel: "none",
          status: "SUPPRESSED",
          reason,
          message: listing.isDuplicateOf
            ? "Duplicate listing — alert suppressed to avoid repeat noise."
            : "Listing unchanged since the last alert — suppressed to avoid repeat noise.",
        },
      });
      continue;
    }

    const message =
      action === "PRICE_DROP"
        ? buildPriceDropMessage(profile, listing, match.lastAlertedPrice!, listing.price!)
        : action === "MATERIAL_CHANGE"
          ? buildMaterialChangeMessage(profile, listing, match.lastAlertedSnapshot, currentSnapshot)
          : buildAlertMessage(listing, { score: result.score, missingFields: result.missingFields });

    const pendingAlert = await prisma.alert.create({
      data: { matchId: match.id, kind: "MATCH_ALERT", channel: "pending", status: "SENDING", reason: action, message },
    });
    // Structured push target: tap opens the listing; tag=listing id so a
    // price-drop notification replaces the stale original on the lock screen.
    const sent = await sendAlert(message, { url: listing.url ?? undefined, tag: listing.id });
    await prisma.alert.update({
      where: { id: pendingAlert.id },
      data: {
        channel: sent.channel,
        status: sent.status,
        error: sent.error ?? null,
        sentAt: sent.status === "SENT" ? new Date() : null,
      },
    });
    // "Alerted" means REACHED THE USER. sendAlert now encodes this honestly:
    // a console outcome is SENT only for a true console-only user (no Telegram
    // and no Twilio configured/intended); any real-channel failure lands as
    // FAILED, keeping the match un-alerted so every scan pass retries it.
    // Without this, one `.env` regression silently marks every match
    // "alerted" and suppresses it forever.
    const delivered = sent.status === "SENT";
    if (delivered) {
      await prisma.match.update({
        where: { id: match.id },
        data: { alerted: true, alertChannel: sent.channel, lastAlertedPrice: listing.price, lastAlertedSnapshot: currentSnapshot },
      });
    } else {
      deliveryFailed = true;
    }

    if (sent.status === "SENT") summary.alertsSent++;
    if (action === "PRICE_DROP") summary.priceDropFired = true;
    if (action === "MATERIAL_CHANGE") summary.materialChangeFired = true;
  }

  // A failed delivery keeps the listing unscanned so EVERY scan pass (cloud
  // cron leftovers + "Run scan now") retries it — the retry must not depend on
  // a browser watcher happening to re-send the same listing.
  await prisma.listing.update({ where: { id: listing.id }, data: { scanned: !deliveryFailed } });
  return summary;
}

export type IngestOutcome = "new" | "price_drop" | "material_change" | "suppressed" | "updated";

/** Full ingestion for a pasted/URL/automatic listing: store (or update in place) + match + alert. */
export async function ingestAndMatch(rawText: string, source: Source, url: string | null, meta: IngestMeta = {}) {
  const ingest = await ingestListing(rawText, source, url, meta);
  const summary = await matchListing(ingest.listing);

  let outcome: IngestOutcome = "updated";
  if (ingest.isNew) outcome = "new";
  else if (summary.priceDropFired) outcome = "price_drop";
  else if (summary.materialChangeFired) outcome = "material_change";
  else if (summary.suppressedCount > 0) outcome = "suppressed";

  return { ...ingest, ...summary, outcome };
}

/** "Run scan now": process all listings not yet scanned (e.g. seeded demo listings, queued items). */
export async function runScan(): Promise<{ processed: number; matchesCreated: number; alertsSent: number }> {
  const pending = await prisma.listing.findMany({ where: { scanned: false } });
  let matchesCreated = 0;
  let alertsSent = 0;
  for (const listing of pending) {
    const summary = await matchListing(listing);
    matchesCreated += summary.matchesCreated;
    alertsSent += summary.alertsSent;
  }
  return { processed: pending.length, matchesCreated, alertsSent };
}

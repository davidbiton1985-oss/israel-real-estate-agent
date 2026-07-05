// Ingestion + scan pipeline: parse → fingerprint/dedup → store → score vs profiles → alert strong matches.
import { prisma } from "../lib/db";
import { parseListing } from "./parser";
import { fingerprint } from "./dedup";
import { scoreListing } from "./matching";
import { buildAlertMessage, sendAlert } from "./alert";
import type { Listing } from "@prisma/client";

export type Source = "YAD2" | "FACEBOOK" | "WHATSAPP" | "MANUAL" | "URL" | "DEMO";

/** Parse + store a raw pasted listing. Marks duplicates but still stores them. */
export async function ingestListing(rawText: string, source: Source, url: string | null): Promise<Listing> {
  const parsed = parseListing(rawText, url);
  const fp = fingerprint(parsed, rawText, url);
  const existing = await prisma.listing.findFirst({ where: { fingerprint: fp } });

  return prisma.listing.create({
    data: {
      source,
      url,
      yad2ListingId: parsed.yad2ListingId,
      rawText,
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
      fingerprint: fp,
      isDuplicateOf: existing?.id ?? null,
    },
  });
}

/** Score one listing against all active profiles; create matches; alert strong non-duplicate matches. */
export async function matchListing(listing: Listing): Promise<number> {
  const profiles = await prisma.profile.findMany({ where: { active: true } });
  let created = 0;
  for (const profile of profiles) {
    const result = scoreListing(profile, listing);
    const match = await prisma.match.upsert({
      where: { profileId_listingId: { profileId: profile.id, listingId: listing.id } },
      update: {},
      create: {
        profileId: profile.id,
        listingId: listing.id,
        score: result.score,
        status: result.status,
        reasonsPositive: JSON.stringify(result.reasonsPositive),
        reasonsNegative: JSON.stringify(result.reasonsNegative),
        missingFields: JSON.stringify(result.missingFields),
        redFlags: JSON.stringify(result.redFlags),
        recommendedAction: result.recommendedAction,
      },
    });
    created++;

    // Alert: score >= profile WhatsApp threshold, not a duplicate, not already alerted
    const shouldAlert = result.score >= profile.whatsappThreshold && !listing.isDuplicateOf && !match.alerted;
    if (shouldAlert) {
      const message = buildAlertMessage(profile, listing, result);
      const sent = await sendAlert(message);
      await prisma.match.update({
        where: { id: match.id },
        data: { alerted: true, alertChannel: sent.channel },
      });
    }
  }
  await prisma.listing.update({ where: { id: listing.id }, data: { scanned: true } });
  return created;
}

/** Full ingestion for a pasted/URL listing: store + match + alert. */
export async function ingestAndMatch(rawText: string, source: Source, url: string | null) {
  const listing = await ingestListing(rawText, source, url);
  await matchListing(listing);
  return listing;
}

/** "Run scan now": process all listings not yet scanned (e.g. seeded demo listings, queued items). */
export async function runScan(): Promise<{ processed: number; matchesCreated: number }> {
  const pending = await prisma.listing.findMany({ where: { scanned: false } });
  let matchesCreated = 0;
  for (const listing of pending) {
    matchesCreated += await matchListing(listing);
  }
  return { processed: pending.length, matchesCreated };
}

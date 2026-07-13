// Re-score all listings against the current criteria (council fix S8).
//
// Editing a profile used to leave every previously-captured listing frozen at
// its old verdict — widen the price band or add a city and nothing already in
// the DB was re-evaluated. This re-runs scoreListing for every listing and
// refreshes the Match verdicts. It deliberately sends NO alerts: anything that
// newly qualifies is surfaced by the batched review digest, so a criteria
// change can never trigger an instant WhatsApp burst (the fresh-ingest path in
// pipeline.ts still alerts strong matches immediately, unchanged).
import { prisma } from "../lib/db";
import { scoreListing } from "./matching";
import type { Listing, Profile } from "@prisma/client";

const CHUNK = 25; // concurrent upserts per batch — keeps a full re-score ~1-2s

export interface RescoreResult {
  profiles: number;
  listings: number;
  statusChanged: number; // matches whose status flipped
  newlyQualifying: number; // rejected/weak/none → possible/strong
}

function qualifies(status: string | undefined): boolean {
  return status === "strong_match" || status === "possible_match";
}

export async function rescoreAll(): Promise<RescoreResult> {
  const profiles = await prisma.profile.findMany({ where: { active: true } });
  const listings = await prisma.listing.findMany();
  const res: RescoreResult = { profiles: profiles.length, listings: listings.length, statusChanged: 0, newlyQualifying: 0 };

  for (const profile of profiles) {
    const existing = await prisma.match.findMany({ where: { profileId: profile.id }, select: { listingId: true, status: true } });
    const prevStatus = new Map(existing.map((m) => [m.listingId, m.status]));

    for (let i = 0; i < listings.length; i += CHUNK) {
      await Promise.all(
        listings.slice(i, i + CHUNK).map(async (listing) => {
          const r = scoreListing(profile as Profile, listing as Listing);
          const before = prevStatus.get(listing.id);
          if (before !== r.status) res.statusChanged++;
          if (qualifies(r.status) && !qualifies(before)) res.newlyQualifying++;
          await prisma.match.upsert({
            where: { profileId_listingId: { profileId: profile.id, listingId: listing.id } },
            update: {
              score: r.score,
              status: r.status,
              reasonsPositive: JSON.stringify(r.reasonsPositive),
              reasonsNegative: JSON.stringify(r.reasonsNegative),
              missingFields: JSON.stringify(r.missingFields),
              redFlags: JSON.stringify(r.redFlags),
              recommendedAction: r.recommendedAction,
            },
            create: {
              profileId: profile.id,
              listingId: listing.id,
              score: r.score,
              status: r.status,
              reasonsPositive: JSON.stringify(r.reasonsPositive),
              reasonsNegative: JSON.stringify(r.reasonsNegative),
              missingFields: JSON.stringify(r.missingFields),
              redFlags: JSON.stringify(r.redFlags),
              recommendedAction: r.recommendedAction,
            },
          });
        })
      );
    }
  }
  return res;
}

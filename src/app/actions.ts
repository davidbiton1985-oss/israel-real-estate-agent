"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ingestAndMatch, ingestListing, runScan, type Source } from "@/core/pipeline";
import { sendAlert } from "@/core/alert";

const TEST_ALERT_MESSAGE = ["🏠 Real Estate Agent test alert", "If you received this, WhatsApp alerts are working."].join("\n");

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string" || v.trim() === "") return null;
  return v.trim();
}
function num(fd: FormData, key: string): number | null {
  const s = str(fd, key);
  if (s == null) return null;
  const n = Number(s.replace(/[,₪\s]/g, ""));
  return isNaN(n) ? null : n;
}

export async function saveProfile(formData: FormData) {
  const id = str(formData, "id");
  const data = {
    name: str(formData, "name") ?? "My search",
    dealType: str(formData, "dealType") ?? "RENT",
    cities: str(formData, "cities") ?? "",
    neighborhoods: str(formData, "neighborhoods"),
    streets: str(formData, "streets"),
    priceMin: num(formData, "priceMin"),
    priceMax: num(formData, "priceMax") ?? 999999999,
    roomsMin: num(formData, "roomsMin"),
    roomsMax: num(formData, "roomsMax"),
    sizeMinSqm: num(formData, "sizeMinSqm"),
    propertyType: str(formData, "propertyType"),
    entryBy: str(formData, "entryBy"),
    balcony: str(formData, "balcony") ?? "INDIFFERENT",
    parking: str(formData, "parking") ?? "INDIFFERENT",
    elevator: str(formData, "elevator") ?? "INDIFFERENT",
    mamad: str(formData, "mamad") ?? "INDIFFERENT",
    brokerStatusPref: str(formData, "brokerStatusPref") ?? "any",
    brokerFeePref: str(formData, "brokerFeePref") ?? "unknown_allowed",
    maxFeeIfKnown: num(formData, "maxFeeIfKnown"),
    whatsappThreshold: num(formData, "whatsappThreshold") ?? 80,
    dashboardThreshold: num(formData, "dashboardThreshold") ?? 60,
    priceDropReAlert: formData.get("priceDropReAlert") === "on",
    active: formData.get("active") === "on",
  };
  if (id) {
    await prisma.profile.update({ where: { id }, data });
  } else {
    await prisma.profile.create({ data });
  }
  revalidatePath("/");
  redirect("/");
}

export async function deleteProfile(formData: FormData) {
  const id = str(formData, "id");
  if (id) await prisma.profile.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}

export async function addListing(formData: FormData) {
  const rawText = str(formData, "rawText");
  const url = str(formData, "url");
  const source = (str(formData, "source") ?? "MANUAL") as Source;
  if (!rawText && !url) return; // nothing to ingest

  if (!rawText && url) {
    // URL-only capture: store the reference (+ extracted Yad2 ID for future dedup)
    // but do not score/alert — there's nothing meaningful to match on yet, and we
    // never fetch the URL ourselves. The user is nudged to paste the listing text.
    const ingest = await ingestListing("", source, url);
    revalidatePath("/matches");
    redirect(`/add-listing?urlSaved=1&yad2Id=${ingest.listing.yad2ListingId ?? ""}`);
  }

  const result = await ingestAndMatch(rawText!, source, url);
  revalidatePath("/matches");
  redirect(`/matches?outcome=${result.outcome}&listingId=${result.listing.id}`);
}

export async function runScanAction() {
  const result = await runScan();
  revalidatePath("/");
  revalidatePath("/matches");
  redirect(`/matches?scanned=${result.processed}&alertsSent=${result.alertsSent}`);
}

export async function saveListingNotes(formData: FormData) {
  const listingId = str(formData, "listingId");
  if (!listingId) return;
  const notes = str(formData, "qaNotes"); // null clears the note (empty textarea)
  await prisma.listing.update({ where: { id: listingId }, data: { qaNotes: notes } });
  revalidatePath("/matches"); // no redirect: stay on the current filtered view
}

export async function sendTestAlertAction() {
  const result = await sendAlert(TEST_ALERT_MESSAGE);
  await prisma.alert.create({
    data: {
      kind: "TEST_ALERT",
      channel: result.channel,
      status: result.status,
      reason: "TEST",
      message: TEST_ALERT_MESSAGE,
      error: result.error ?? null,
      sentAt: result.status === "SENT" ? new Date() : null,
    },
  });
  revalidatePath("/");
  redirect("/?testAlert=1");
}

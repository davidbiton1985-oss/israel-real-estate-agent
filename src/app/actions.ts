"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ingestAndMatch, ingestListing, type Source } from "@/core/pipeline";
import { pollSources } from "@/core/poll";
import { sendAlert } from "@/core/alert";
import { rescoreAll } from "@/core/rescore";

const TEST_ALERT_MESSAGE = ["🧪 בדיקת התראות — סוכן הנדל״ן", "אם ההודעה הזו הגיעה אליך, ההתראות עובדות."].join("\n");

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
  // Re-evaluate every already-captured listing against the new criteria, so a
  // change surfaces previously-frozen matches instead of leaving them at their
  // old verdict. No alerts here — anything newly qualifying reaches you via the
  // batched review digest, so a criteria change can't fire a WhatsApp burst.
  try {
    await rescoreAll();
  } catch (e) {
    console.error("[saveProfile] rescore failed (profile still saved):", e);
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
  // Same pass the 5-minute watcher runs: poll automatic sources (email inbox)
  // + process leftovers — so "Run scan now" exercises the real pipeline.
  const result = await pollSources();
  revalidatePath("/");
  revalidatePath("/matches");
  // A failed email poll must NOT wear the success banner — carry the error.
  const params = new URLSearchParams({
    scanned: String(result.scannedLeftovers + result.listingsIngested),
    alertsSent: String(result.alertsSent),
    emails: String(result.emailsSeen),
  });
  if (result.emailConfigured && !result.emailOk) {
    params.set("scanError", (result.emailError ?? "בדיקת האימייל נכשלה").slice(0, 160));
  }
  redirect(`/matches?${params.toString()}`);
}

export async function saveListingNotes(formData: FormData) {
  const listingId = str(formData, "listingId");
  if (!listingId) return;
  const notes = str(formData, "qaNotes"); // null clears the note (empty textarea)
  await prisma.listing.update({ where: { id: listingId }, data: { qaNotes: notes } });
  revalidatePath("/matches"); // no redirect: stay on the current filtered view
}

// --- Wave 2: the decide→act loop ---------------------------------------

const USER_STATUSES = ["NEW", "CONTACTED", "VIEWING", "DISMISSED", "WON"] as const;

/** One-tap triage. DISMISSED also silences every future re-alert for the
 * listing (decideAlertAction's userDismissed input). Tapping the current
 * status again returns the listing to NEW (undo). */
export async function setListingStatus(formData: FormData) {
  const listingId = str(formData, "listingId");
  const status = str(formData, "status") as (typeof USER_STATUSES)[number] | null;
  if (!listingId || !status || !USER_STATUSES.includes(status)) return;
  const current = await prisma.listing.findUnique({ where: { id: listingId }, select: { userStatus: true } });
  if (!current) return;
  const next = current.userStatus === status ? "NEW" : status;
  await prisma.listing.update({ where: { id: listingId }, data: { userStatus: next } });
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(`/listing/${listingId}`);
}

/** Pursuit details: a free note ("callback after 18:00") + viewing datetime. */
export async function savePursuit(formData: FormData) {
  const listingId = str(formData, "listingId");
  if (!listingId) return;
  const userNote = str(formData, "userNote");
  const viewingRaw = str(formData, "viewingAt");
  const viewingAt = viewingRaw ? new Date(viewingRaw) : null;
  await prisma.listing.update({
    where: { id: listingId },
    data: { userNote, viewingAt: viewingAt && !isNaN(viewingAt.getTime()) ? viewingAt : null },
  });
  revalidatePath("/");
  revalidatePath(`/listing/${listingId}`);
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
  // The banner must tell the truth: sent and failed are different outcomes.
  redirect(`/?testAlert=${result.status === "SENT" ? "sent" : "failed"}`);
}

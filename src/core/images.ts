// Localize a listing photo: source CDN urls (especially Facebook's scontent
// links) carry expiring signatures, so the image is downloaded once at capture
// time into public/uploads and the listing points at the durable local copy.
// Best-effort, never throws — a listing without a photo is still a listing.
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

const MAX_BYTES = 8_000_000;
const MIN_BYTES = 2_000; // tracking pixels / broken responses

export async function localizeListingImage(listingId: string, remoteUrl: string): Promise<void> {
  try {
    if (!/^https?:\/\//.test(remoteUrl)) return;
    const res = await fetch(remoteUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    if (!res.ok) return;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) return;
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
    const dir = path.join(process.cwd(), "public", "uploads");
    mkdirSync(dir, { recursive: true });
    const file = `${listingId}.${ext}`;
    writeFileSync(path.join(dir, file), buf);
    const { prisma } = await import("../lib/db");
    await prisma.listing.update({ where: { id: listingId }, data: { imageUrl: `/uploads/${file}` } });
  } catch (e) {
    console.error("[images] localize failed:", e instanceof Error ? e.message : e);
  }
}

/** Fire-and-forget wrapper: localize only when the stored image is still remote. */
export function maybeLocalizeImage(listingId: string, current: string | null | undefined, captured: string | null | undefined): void {
  const target = captured ?? current;
  if (!target || !/^https?:\/\//.test(target)) return;
  if (current?.startsWith("/uploads/")) return;
  void localizeListingImage(listingId, target);
}

// ---------------------------------------------------------------------------
// Automatic disk cleanup (runs daily via the heartbeat job). Photos are only
// worth keeping while the apartment is worth chasing:
//   pursued (CONTACTED/VIEWING/WON) → keep forever
//   relevant (strong/possible, not dismissed) → keep 30 days
//   everything else → keep 7 days
//   orphan file (listing deleted) → delete now
// The DB is never weighed down — it only ever holds the short path string.
// ---------------------------------------------------------------------------
const KEEP_RELEVANT_DAYS = 30;
const KEEP_IRRELEVANT_DAYS = 7;

export async function cleanupListingImages(): Promise<{ scanned: number; deleted: number }> {
  const { readdirSync, unlinkSync, existsSync } = await import("fs");
  const dir = path.join(process.cwd(), "public", "uploads");
  const out = { scanned: 0, deleted: 0 };
  if (!existsSync(dir)) return out;
  const { prisma } = await import("../lib/db");
  const now = Date.now();

  for (const file of readdirSync(dir)) {
    if (!/\.(jpg|png|webp)$/.test(file)) continue;
    out.scanned++;
    const id = file.replace(/\.(jpg|png|webp)$/, "");
    try {
      const listing = await prisma.listing.findUnique({
        where: { id },
        include: { matches: { orderBy: { score: "desc" }, take: 1 } },
      });
      let expired = false;
      if (!listing) {
        expired = true; // orphan
      } else {
        const pursued = ["CONTACTED", "VIEWING", "WON"].includes(listing.userStatus);
        if (!pursued) {
          const relevant =
            listing.userStatus !== "DISMISSED" &&
            listing.matches[0] != null &&
            ["strong_match", "possible_match"].includes(listing.matches[0].status);
          const ageDays = (now - listing.createdAt.getTime()) / 86_400_000;
          expired = ageDays > (relevant ? KEEP_RELEVANT_DAYS : KEEP_IRRELEVANT_DAYS);
        }
      }
      if (expired) {
        unlinkSync(path.join(dir, file));
        out.deleted++;
        if (listing?.imageUrl === `/uploads/${file}`) {
          await prisma.listing.update({ where: { id }, data: { imageUrl: null } });
        }
      }
    } catch (e) {
      console.error("[images] cleanup item failed:", e instanceof Error ? e.message : e);
    }
  }
  if (out.deleted > 0) console.log(`[images] cleanup: deleted ${out.deleted}/${out.scanned} photos`);
  return out;
}

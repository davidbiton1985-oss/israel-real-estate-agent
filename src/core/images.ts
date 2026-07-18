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

// Capture endpoint for browser-side ingestion — used by:
//   • the one-click bookmarklet (docs/browser-helper.md): any Facebook surface
//     or listing page the user is viewing
//   • the Yad2 tab watcher userscript (docs/yad2-tab-watcher.user.js): posts
//     new listing cards from the user's own open Yad2 search tab
// Everything runs the full pipeline: parse → dedup → score → WhatsApp if strong.
// No page fetching happens server-side; the browser sends what the user is
// already legitimately viewing in their own session.
//
// CORS is open because callers run on facebook.com/yad2.co.il origins and the
// server binds to localhost only (personal single-user tool). We also grant
// Chrome's Private Network Access (PNA) preflight — without it, Chrome
// silently blocks a public HTTPS page (Yad2/Facebook) from reaching a
// localhost server even though CORS itself allows it.
import { NextRequest, NextResponse } from "next/server";
import { ingestAndMatch } from "@/core/pipeline";
import { classifyCaptureSource, looksLikeMergedYad2Cards } from "@/core/capture";
import { classifyFbUrl } from "@/core/connectors/facebook";
import { listingCandidates, groupContext, extractListingFromPost } from "@/core/bulkExtract";
import { maybeLocalizeImage } from "@/core/images";
import { prisma } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: {
    text?: string;
    url?: string;
    title?: string;
    image?: string;
    bulk?: boolean;
    groupName?: string;
    posts?: { text?: string; url?: string; image?: string }[];
    /** photo backfill for ALREADY-CAPTURED listings: url→image pairs the
     * watcher sees on screen right now (fills the gallery retroactively) */
    imageBackfill?: { url?: string; image?: string }[];
    heartbeat?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const text = (body.text ?? "").trim();
  const url = (body.url ?? "").trim() || null;
  const title = (body.title ?? "").trim();

  // ---- HEARTBEAT: a watcher saying "alive, nothing new" -------------------
  // Watchers only used to POST when they had listings, so a quiet market was
  // indistinguishable from a dead tab and the watchdog cried wolf. Heartbeats
  // refresh liveness without touching the listing counters.
  if (typeof body.heartbeat === "string") {
    const src = body.heartbeat === "FACEBOOK" ? "FACEBOOK" : "YAD2_BROWSER";
    await prisma.sourceHealth.upsert({
      where: { source: src },
      create: { source: src, lastCheckAt: new Date(), lastSuccessAt: new Date() },
      update: { enabled: true, lastCheckAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveErrors: 0 },
    });
    return NextResponse.json({ ok: true, heartbeat: src }, { headers: CORS_HEADERS });
  }

  // ---- IMAGE BACKFILL + "seen today" ping ---------------------------------
  // The watcher reports url→image for EVERYTHING visible each cycle (not only
  // new cards). We use it for two things: (1) attach a photo to a known listing
  // that lacks one, and (2) stamp lastSeenAt on EVERY listing we ran past — so
  // "how many apartments the bot checked today" counts re-seen listings, not
  // just newly-captured ones (Yad2's standing inventory is mostly already-seen).
  if (Array.isArray(body.imageBackfill)) {
    let touched = 0;
    let attached = 0;
    for (const item of body.imageBackfill.slice(0, 80)) {
      const iUrl = (item.url ?? "").trim();
      const img = (item.image ?? "").trim();
      if (!iUrl) continue;
      try {
        // Exact-url match is too brittle — Yad2 rewrites item urls and FB
        // serves the same group as numeric id OR vanity name — so also match
        // by the stable ids: yad2 item id / fb post id.
        const itemId = iUrl.match(/\/item\/([A-Za-z0-9]+)/)?.[1] ?? null;
        const fbPid = iUrl.match(/\/(?:posts|permalink)\/([A-Za-z0-9]+)/)?.[1] ?? null;
        const or: object[] = [{ url: iUrl }];
        if (itemId) or.push({ yad2ListingId: itemId }, { url: { contains: `/item/${itemId}` } });
        if (fbPid) or.push({ url: { contains: `/posts/${fbPid}` } }, { url: { contains: `/permalink/${fbPid}` } });
        const listing = await prisma.listing.findFirst({ where: { OR: or }, select: { id: true, imageUrl: true } });
        if (!listing) continue;
        const data: { lastSeenAt: Date; imageUrl?: string } = { lastSeenAt: new Date() };
        if (!listing.imageUrl && /^https?:/.test(img)) data.imageUrl = img;
        await prisma.listing.update({ where: { id: listing.id }, data });
        if (data.imageUrl) { maybeLocalizeImage(listing.id, img, img); attached++; }
        touched++;
      } catch {}
    }
    if (body.imageBackfill.length > 0) console.log(`[capture/backfill] seen=${touched} photos=${attached}`);
    return NextResponse.json({ ok: true, seen: touched, backfill: attached }, { headers: CORS_HEADERS });
  }

  // ---- DIAG mode: the FB reader reports what it Sees on each post page ----
  // Log-only — never ingested. Lets us debug extraction on the user's real
  // logged-in pages without DevTools on their side.
  if (body && typeof (body as Record<string, unknown>).diag === "object") {
    console.log("[reader-diag]", JSON.stringify((body as Record<string, unknown>).diag));
    return NextResponse.json({ ok: true, diag: true }, { headers: CORS_HEADERS });
  }

  // ---- POSTS mode (automatic Facebook WITH per-post links) ----
  // The watcher sends each post's text paired with its own permalink; we extract
  // the listing from each post and tag it with THAT post's link — so the WhatsApp
  // alert links straight to the apartment, not just the group.
  if (Array.isArray(body.posts)) {
    const ctx = groupContext(body.groupName ?? "");
    const fbSurface = classifyFbUrl(url);
    let ingested = 0, newCount = 0, alertsSent = 0;
    let top: { score: number; status: string; profile: string } | null = null;
    const seenSig = new Set<string>();
    for (const post of body.posts) {
      const pText = (post.text ?? "").trim();
      const pUrl = (post.url ?? "").trim() || url; // fall back to group page if no permalink
      if (pText.length < 15) continue;
      const cand = extractListingFromPost(pText, ctx); // ONE listing per post (whole-post parse)
      if (!cand) continue;
      const sig = `${cand.city}|${cand.text.slice(0, 40)}`;
      if (seenSig.has(sig)) continue;
      seenSig.add(sig);
      try {
        const result = await ingestAndMatch(cand.text, "FACEBOOK", pUrl, {
          fbSurface,
          fbSourceName: body.groupName ?? null,
          imageUrl: post.image?.trim() || null,
        });
        maybeLocalizeImage(result.listing.id, result.listing.imageUrl, post.image?.trim() || null);
        ingested++;
        if (result.isNew) newCount++;
        alertsSent += result.alertsSent;
        const m = await prisma.match.findFirst({ where: { listingId: result.listing.id }, orderBy: { score: "desc" }, include: { profile: true } });
        if (m && (!top || m.score > top.score)) top = { score: m.score, status: m.status, profile: m.profile.name };
      } catch (e) {
        console.error("[capture/posts] ingest failed:", e instanceof Error ? e.message : e);
      }
    }
    // Record EVERY watcher delivery — an empty scan ("checked, nothing to
    // ingest") is still a successful check. Gating this on ingested>0 made a
    // healthy-but-quiet watcher indistinguishable from a dead one.
    await prisma.sourceHealth.upsert({
      where: { source: "FACEBOOK" },
      create: { source: "FACEBOOK", lastCheckAt: new Date(), lastSuccessAt: new Date(), lastItemsFound: body.posts.length, lastNewListings: newCount, totalIngested: newCount },
      update: { enabled: true, lastCheckAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveErrors: 0, lastItemsFound: body.posts.length, lastNewListings: newCount, totalIngested: { increment: newCount } },
    });
    console.log(
      `[capture/posts] group="${body.groupName ?? ""}" posts=${body.posts.length} listings=${ingested} new=${newCount} alerts=${alertsSent}`
    );
    return NextResponse.json(
      { ok: true, posts: body.posts.length, listings: ingested, new: newCount, alertsSent, topScore: top?.score ?? null, topStatus: top?.status ?? null, topProfile: top?.profile ?? null },
      { headers: CORS_HEADERS }
    );
  }

  // ---- BULK mode (the automatic Facebook path) ----
  // The watcher sends the whole harvested page text; the server finds the
  // apartment listings inside it and ingests each one.
  if (body.bulk) {
    const candidates = listingCandidates(text);
    const fbSurface = classifyFbUrl(url);
    let ingested = 0, newCount = 0, alertsSent = 0;
    let top: { score: number; status: string; profile: string } | null = null;
    for (const c of candidates) {
      try {
        const result = await ingestAndMatch(c, "FACEBOOK", url, { fbSurface });
        ingested++;
        if (result.isNew) newCount++;
        alertsSent += result.alertsSent;
        const m = await prisma.match.findFirst({
          where: { listingId: result.listing.id },
          orderBy: { score: "desc" },
          include: { profile: true },
        });
        if (m && (!top || m.score > top.score)) top = { score: m.score, status: m.status, profile: m.profile.name };
      } catch (e) {
        console.error("[capture/bulk] ingest failed:", e instanceof Error ? e.message : e);
      }
    }
    // Same as posts-mode: record every delivery, even a 0-candidate scan.
    await prisma.sourceHealth.upsert({
      where: { source: "FACEBOOK" },
      create: { source: "FACEBOOK", lastCheckAt: new Date(), lastSuccessAt: new Date(), lastItemsFound: candidates.length, lastNewListings: newCount, totalIngested: newCount },
      update: { enabled: true, lastCheckAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveErrors: 0, lastItemsFound: candidates.length, lastNewListings: newCount, totalIngested: { increment: newCount } },
    });
    console.log(`[capture/bulk] candidates=${candidates.length} listings=${ingested} new=${newCount} alerts=${alertsSent}`);
    return NextResponse.json(
      { ok: true, bulk: true, candidates: candidates.length, ingested, new: newCount, alertsSent, topScore: top?.score ?? null, topStatus: top?.status ?? null, topProfile: top?.profile ?? null },
      { headers: CORS_HEADERS }
    );
  }

  if (text.length < 20) {
    return NextResponse.json(
      { ok: false, error: "Select the post text first (at least a sentence), then click the bookmarklet." },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { source, meta, healthSource } = classifyCaptureSource(url, title);

  // Guard against tab-watcher < v1.1 sending the whole results grid as one
  // "listing": its fields and URL would belong to different apartments.
  if (source === "YAD2" && looksLikeMergedYad2Cards(text)) {
    return NextResponse.json(
      { ok: false, error: "Capture contains multiple Yad2 listings merged together — update the Yad2 tab-watcher userscript to v1.1 (docs/yad2-tab-watcher.user.js)." },
      { status: 422, headers: CORS_HEADERS }
    );
  }

  const rawText = title && !text.includes(title) ? `${title}\n${text}` : text;
  const capturedImage = (body.image ?? "").trim() || null;
  const result = await ingestAndMatch(rawText, source, url, { ...meta, imageUrl: capturedImage });
  maybeLocalizeImage(result.listing.id, result.listing.imageUrl, capturedImage);

  // Credit the capture in the right SourceHealth row so the dashboard reflects activity.
  if (healthSource) {
    await prisma.sourceHealth.upsert({
      where: { source: healthSource },
      create: {
        source: healthSource,
        lastCheckAt: new Date(),
        lastSuccessAt: new Date(),
        lastItemsFound: 1,
        lastNewListings: result.isNew ? 1 : 0,
        totalIngested: result.isNew ? 1 : 0,
      },
      update: {
        enabled: true,
        lastCheckAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        consecutiveErrors: 0,
        ...(result.isNew ? { totalIngested: { increment: 1 } } : {}),
      },
    });
  }

  const topMatch = await prisma.match.findFirst({
    where: { listingId: result.listing.id },
    orderBy: { score: "desc" },
    include: { profile: true },
  });

  return NextResponse.json(
    {
      ok: true,
      outcome: result.outcome,
      alertsSent: result.alertsSent,
      source,
      fbSurface: source === "FACEBOOK" ? meta.fbSurface : undefined,
      topScore: topMatch?.score ?? null,
      topStatus: topMatch?.status ?? null,
      topProfile: topMatch?.profile.name ?? null,
    },
    { headers: CORS_HEADERS }
  );
}

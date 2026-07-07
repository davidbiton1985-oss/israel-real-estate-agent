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
import { classifyCaptureSource } from "@/core/capture";
import { classifyFbUrl } from "@/core/connectors/facebook";
import { listingCandidates, listingCandidatesDetailed, groupContext } from "@/core/bulkExtract";
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
    bulk?: boolean;
    groupName?: string;
    posts?: { text?: string; url?: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const text = (body.text ?? "").trim();
  const url = (body.url ?? "").trim() || null;
  const title = (body.title ?? "").trim();

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
      for (const cand of listingCandidatesDetailed(pText, ctx)) {
        const sig = `${cand.city}|${cand.text.slice(0, 30)}`;
        if (seenSig.has(sig)) continue;
        seenSig.add(sig);
        try {
          const result = await ingestAndMatch(cand.text, "FACEBOOK", pUrl, { fbSurface, fbSourceName: body.groupName ?? null });
          ingested++;
          if (result.isNew) newCount++;
          alertsSent += result.alertsSent;
          const m = await prisma.match.findFirst({ where: { listingId: result.listing.id }, orderBy: { score: "desc" }, include: { profile: true } });
          if (m && (!top || m.score > top.score)) top = { score: m.score, status: m.status, profile: m.profile.name };
        } catch (e) {
          console.error("[capture/posts] ingest failed:", e instanceof Error ? e.message : e);
        }
      }
    }
    if (ingested > 0) {
      await prisma.sourceHealth.upsert({
        where: { source: "FACEBOOK" },
        create: { source: "FACEBOOK", lastCheckAt: new Date(), lastSuccessAt: new Date(), lastItemsFound: body.posts.length, lastNewListings: newCount, totalIngested: newCount },
        update: { enabled: true, lastCheckAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveErrors: 0, lastItemsFound: body.posts.length, lastNewListings: newCount, totalIngested: { increment: newCount } },
      });
    }
    return NextResponse.json(
      { ok: true, posts: body.posts.length, listings: ingested, new: newCount, alertsSent, topScore: top?.score ?? null, topStatus: top?.status ?? null, topProfile: top?.profile ?? null },
      { headers: CORS_HEADERS }
    );
  }

  // ---- BULK mode (the automatic Facebook path) ----
  // The watcher sends the whole harvested page text; the server finds the
  // apartment listings inside it and ingests each one.
  if (body.bulk) {
    // TEMP DEBUG: dump the harvested text so we can see what the real group sent.
    try {
      const { writeFileSync } = await import("fs");
      const anchors = (text.match(/להשכרה|להשכיר|למכירה|for rent|for sale/gi) || []).length;
      writeFileSync("/tmp/fb-bulk-debug.txt", `len=${text.length} anchors=${anchors}\n\n${text}`);
      console.log(`[capture/bulk] received ${text.length} chars, ${anchors} rent/sale anchors`);
    } catch {
      /* ignore debug write errors */
    }
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
    if (candidates.length > 0) {
      await prisma.sourceHealth.upsert({
        where: { source: "FACEBOOK" },
        create: { source: "FACEBOOK", lastCheckAt: new Date(), lastSuccessAt: new Date(), lastItemsFound: candidates.length, lastNewListings: newCount, totalIngested: newCount },
        update: { enabled: true, lastCheckAt: new Date(), lastSuccessAt: new Date(), lastError: null, consecutiveErrors: 0, lastItemsFound: candidates.length, lastNewListings: newCount, totalIngested: { increment: newCount } },
      });
    }
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

  const rawText = title && !text.includes(title) ? `${title}\n${text}` : text;
  const result = await ingestAndMatch(rawText, source, url, meta);

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

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
  let body: { text?: string; url?: string; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
  }

  const text = (body.text ?? "").trim();
  const url = (body.url ?? "").trim() || null;
  const title = (body.title ?? "").trim();
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

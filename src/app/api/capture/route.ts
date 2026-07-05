// One-click capture endpoint for the browser bookmarklet (docs/browser-helper.md).
// While browsing ANY Facebook surface (public post, profile, broker page, share,
// marketplace) — or any other listing site — one click POSTs the selected text +
// page URL here and it runs through the full pipeline: parse → dedup → score →
// WhatsApp if strong. No page fetching happens server-side; the browser sends
// what the user is already legitimately viewing.
//
// CORS is open because the bookmarklet runs on facebook.com's origin and the
// server binds to localhost only (personal single-user tool).
import { NextRequest, NextResponse } from "next/server";
import { ingestAndMatch, type Source } from "@/core/pipeline";
import { classifyFbUrl } from "@/core/connectors/facebook";
import { prisma } from "@/lib/db";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

  const isFacebook = url != null && /facebook\.com/i.test(url);
  const source: Source = isFacebook ? "FACEBOOK" : url != null && /yad2\.co\.il/i.test(url) ? "YAD2" : "URL";
  const meta = isFacebook
    ? { fbSurface: classifyFbUrl(url), fbSourceName: title || null, fbAuthor: null }
    : {};

  const rawText = title && !text.includes(title) ? `${title}\n${text}` : text;
  const result = await ingestAndMatch(rawText, source, url, meta);

  // Count captures in the FACEBOOK health row so the dashboard reflects activity.
  if (isFacebook && result.isNew) {
    await prisma.sourceHealth.upsert({
      where: { source: "FACEBOOK" },
      create: { source: "FACEBOOK", lastSuccessAt: new Date(), totalIngested: 1 },
      update: { lastSuccessAt: new Date(), totalIngested: { increment: 1 } },
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
      fbSurface: isFacebook ? meta.fbSurface : undefined,
      topScore: topMatch?.score ?? null,
      topStatus: topMatch?.status ?? null,
      topProfile: topMatch?.profile.name ?? null,
    },
    { headers: CORS_HEADERS }
  );
}

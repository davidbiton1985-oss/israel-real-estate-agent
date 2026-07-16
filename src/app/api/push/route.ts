import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { webPushConfigured } from "@/core/webpush";

export const dynamic = "force-dynamic";

/** GET → is push available + the VAPID public key the client subscribes with. */
export async function GET() {
  if (!webPushConfigured()) {
    return NextResponse.json({ enabled: false, publicKey: null });
  }
  return NextResponse.json({ enabled: true, publicKey: process.env.VAPID_PUBLIC_KEY });
}

/** POST { endpoint, keys:{p256dh,auth} } → register this device for alerts. */
export async function POST(req: Request) {
  const sub = (await req.json()) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "מנוי לא תקין — חסרים endpoint או מפתחות." }, { status: 400 });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: req.headers.get("user-agent"),
    },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

/** DELETE { endpoint } → stop alerts to this device. */
export async function DELETE(req: Request) {
  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}

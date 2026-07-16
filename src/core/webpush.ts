// Web Push broadcast to every subscribed device (the installed PWA).
// Runs ALONGSIDE Telegram/WhatsApp — a parallel best-effort channel, never
// part of the delivery-preference chain and never the reason an alert fails.
//
// Deliberately lazy: prisma and web-push are imported only when VAPID keys
// are configured, so sendAlert() stays unit-testable with no DB and the
// module is a no-op on unconfigured installs.

export function webPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/**
 * Push `message` to all subscriptions. Title = first line, body = the next
 * lines; a URL inside the message becomes the notification's click target
 * (deep link straight to the listing). Dead endpoints (404/410) are pruned.
 * Never throws.
 */
export async function sendWebPushBroadcast(message: string): Promise<void> {
  if (!webPushConfigured()) return;
  try {
    const [{ prisma }, webpushMod] = await Promise.all([import("../lib/db"), import("web-push")]);
    const webpush = webpushMod.default;
    const subs = await prisma.pushSubscription.findMany();
    if (subs.length === 0) return;

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:alerts@localhost",
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const lines = message.split("\n").filter((l) => l.trim() !== "");
    const title = (lines[0] ?? "התראה").slice(0, 90);
    const body = lines.slice(1).join("\n").slice(0, 300);
    const url = message.match(/https?:\/\/\S+/)?.[0] ?? "/";
    const payload = JSON.stringify({ title, body, url });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
            { TTL: 3600 }
          );
        } catch (e: unknown) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // device unsubscribed / endpoint expired — stop pushing to it
            await prisma.pushSubscription.delete({ where: { endpoint: s.endpoint } }).catch(() => {});
          } else {
            console.error("[webpush] send failed:", status ?? (e instanceof Error ? e.message : e));
          }
        }
      })
    );
  } catch (e) {
    console.error("[webpush] broadcast error:", e instanceof Error ? e.message : e);
  }
}

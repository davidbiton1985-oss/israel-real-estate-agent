// Service worker for the installed PWA — receives Web Push and shows the
// notification. iOS requires showNotification for every push (userVisibleOnly).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "סוכן הנדל״ן", body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "he",
    data: { url: data.url || "/" },
  };
  if (data.tag) {
    // Same tag = the newer notification REPLACES the stale one (a price drop
    // supersedes the original card); renotify keeps the buzz on replacement.
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || "סוכן הנדל״ן", options));
});

// iOS silently rotates/expires push subscriptions (updates, storage clears).
// Re-subscribe with the same server key and re-register — otherwise the
// server keeps pushing at a dead endpoint and the lock screen goes quiet.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const key = event.oldSubscription && event.oldSubscription.options
        ? event.oldSubscription.options.applicationServerKey
        : null;
      if (!key) return;
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
    })().catch(() => {})
  );
});

// Tap → open the listing link (or the app) — reuse an open window if there is one.
// iOS quirk: WindowClient.navigate() silently fails in a standalone PWA that
// was resumed from background (the app focuses on its LAST page — David tapped
// a listing push and landed on the dashboard). The reliable route on iOS is
// postMessage → the page navigates itself; navigate() stays as belt-and-braces.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const sameApp = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (url.startsWith("http") && new URL(url).origin !== self.location.origin) {
        return self.clients.openWindow(url); // external listing link
      }
      if (sameApp) {
        return sameApp.focus().then((w) => {
          try { w.postMessage({ navigate: url }); } catch (e) {}
          if ("navigate" in w) return w.navigate(url).catch(() => {});
        });
      }
      return self.clients.openWindow(url);
    })
  );
});

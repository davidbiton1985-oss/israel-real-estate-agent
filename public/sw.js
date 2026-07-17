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

// Tap → open the listing link (or the app) — reuse an open window if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const sameApp = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (url.startsWith("http") && new URL(url).origin !== self.location.origin) {
        return self.clients.openWindow(url); // external listing link
      }
      if (sameApp) return sameApp.focus().then((w) => ("navigate" in w ? w.navigate(url) : w));
      return self.clients.openWindow(url);
    })
  );
});

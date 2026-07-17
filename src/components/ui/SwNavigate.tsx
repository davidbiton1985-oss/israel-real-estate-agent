"use client";

// The service worker's notificationclick can't reliably navigate a resumed
// standalone PWA on iOS (WindowClient.navigate silently no-ops), so it also
// posts { navigate } — and the page navigates itself. Mounted once in layout.
import { useEffect } from "react";

export default function SwNavigate() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      const url = (e.data as { navigate?: string } | null)?.navigate;
      if (typeof url === "string" && url.length > 0) {
        window.location.href = url;
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}

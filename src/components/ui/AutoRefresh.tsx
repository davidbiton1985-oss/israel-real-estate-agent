"use client";

// The PWA problem this solves: iOS restores the standalone app from a frozen
// snapshot, so a dashboard opened "now" can show hours-old server-rendered
// data with no reload button and no pull-to-refresh. This re-runs the server
// components in place (router.refresh — no scroll loss) whenever the app
// returns to the foreground and the last refresh is older than a minute.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const STALE_MS = 60_000;

export default function AutoRefresh() {
  const router = useRouter();
  const last = useRef(Date.now());

  useEffect(() => {
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last.current < STALE_MS) return;
      last.current = Date.now();
      router.refresh();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) maybeRefresh(); // restored from bfcache/snapshot
    };
    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}

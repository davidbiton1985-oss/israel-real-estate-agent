"use client";

// Flash messages ride query params (?testAlert=…, ?scanned=…). In a standalone
// PWA, iOS restores the last URL on relaunch — so without cleanup, Tuesday's
// "scan complete" replays on Thursday as fresh news, and router.refresh()
// re-shows it forever. This wrapper shows the server-rendered banner once,
// strips its params from the URL, and (optionally) auto-dismisses.
import { useEffect, useState } from "react";

export default function FlashBanner({
  clear,
  autoHideMs = 6000,
  children,
}: {
  /** Query params to remove from the URL after first paint. */
  clear: string[];
  /** 0 = stay until refresh/navigation (use for failures). */
  autoHideMs?: number;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    let changed = false;
    for (const k of clear) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    if (changed) window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (autoHideMs > 0) {
      const t = setTimeout(() => setVisible(false), autoHideMs);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;
  return <>{children}</>;
}

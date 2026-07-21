"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** iOS standalone PWAs disable Safari's native pull-to-refresh, so the app felt
 * "stuck" on stale data. This adds our own: pull down from the top to refresh,
 * plus an automatic refresh when the app returns to the foreground (so opening
 * it always shows fresh matches). */
const THRESHOLD = 70; // px of pull (after damping) that triggers a refresh

export default function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const pullRef = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    function refresh() {
      setBusy(true);
      router.refresh();
      window.setTimeout(() => {
        setBusy(false);
        setPull(0);
        pullRef.current = 0;
      }, 1000);
    }

    function onStart(e: TouchEvent) {
      active.current = window.scrollY <= 0 && !busy;
      startY.current = e.touches[0].clientY;
    }
    function onMove(e: TouchEvent) {
      if (!active.current || busy) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        const damped = Math.min(dy * 0.5, THRESHOLD + 24);
        pullRef.current = damped;
        setPull(damped);
      } else if (dy <= 0) {
        active.current = false;
        pullRef.current = 0;
        setPull(0);
      }
    }
    function onEnd() {
      if (!active.current) return;
      active.current = false;
      if (pullRef.current >= THRESHOLD) refresh();
      else {
        pullRef.current = 0;
        setPull(0);
      }
    }
    // Refresh when the app comes back to the foreground (e.g. after a push tap).
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [busy, router]);

  const show = pull > 0 || busy;
  const ready = pull >= THRESHOLD;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(${busy ? 12 : Math.min(pull - 24, 14)}px)`,
        opacity: show ? 1 : 0,
        transition: active.current ? "none" : "opacity .2s, transform .2s",
      }}
    >
      <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-card shadow-card">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: busy ? "none" : `rotate(${Math.min(pull * 3, 180)}deg)`,
            animation: busy ? "ptr-spin .7s linear infinite" : "none",
          }}
        >
          {busy ? (
            <path d="M21 12a9 9 0 1 1-6.2-8.6" />
          ) : ready ? (
            <path d="M20 6 9 17l-5-5" />
          ) : (
            <path d="M12 5v14M5 12l7 7 7-7" />
          )}
        </svg>
      </div>
    </div>
  );
}

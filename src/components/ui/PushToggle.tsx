"use client";

// "Enable notifications on this device" — registers the service worker and a
// Web Push subscription. Renders nothing where push can't work (no SW/Push
// API, insecure origin, or VAPID not configured server-side). On iOS the
// permission prompt only appears inside the installed (home-screen) app and
// must come from a user tap — hence a button, never an auto-prompt.
import { useEffect, useState } from "react";
import Icon from "./Icon";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "unsupported" | "loading" | "off" | "on" | "denied" | "busy";

export default function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
        setState("unsupported");
        return;
      }
      try {
        const cfg = await fetch("/api/push").then((r) => r.json());
        if (!cfg.enabled) {
          setState("unsupported");
          return;
        }
        // ?v= forces a fresh script fetch so SW fixes reach the phone on the
        // very next app open (bump on every sw.js change).
        const reg = await navigator.serviceWorker.register("/sw.js?v=4");
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Heal server-side drift on every open: re-POST the subscription
          // (idempotent upsert) so a rotated endpoint never goes stale-green.
          fetch("/api/push", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sub.toJSON()),
          }).catch(() => {});
          setState("on");
        } else setState(Notification.permission === "denied" ? "denied" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  async function enable() {
    setState("busy");
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const cfg = await fetch("/api/push").then((r) => r.json());
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.publicKey),
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error("שמירת המנוי נכשלה");
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("off");
    }
  }

  async function disable() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "unsupported" || state === "loading") return null;

  if (state === "on") {
    return (
      <button
        type="button"
        onClick={disable}
        title="התראות פעילות במכשיר זה — לחץ לכיבוי"
        className="inline-flex items-center gap-1.5 rounded-full bg-good-soft px-3 py-1.5 text-xs font-medium text-good"
      >
        <Icon name="bell" size={13} />
        התראות פעילות במכשיר זה
      </button>
    );
  }

  if (state === "denied") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn">
        <Icon name="bell" size={13} />
        התראות חסומות — אפשר אותן בהגדרות המכשיר
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={enable}
        disabled={state === "busy"}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-card2 disabled:opacity-60"
      >
        <Icon name="bell" size={13} />
        {state === "busy" ? "מפעיל…" : "הפעל התראות במכשיר זה"}
      </button>
      {error && <span className="text-xs text-crit">{error}</span>}
    </span>
  );
}

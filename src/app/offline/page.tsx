/** Served by the service worker when a navigation fails offline — the terrain
 * of apartment viewing is stairwells and parking garages; the app icon must
 * never be a dead button. Static by design (precached at SW install). */
export default function OfflinePage() {
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-sm place-content-center gap-3 text-center">
      <div className="text-4xl">📡</div>
      <h1 className="text-xl font-bold">אין חיבור לשרת</h1>
      <p className="text-sm leading-relaxed text-muted">
        או שאין רשת, או ש-Tailscale כבוי בנייד, או שהמק לא זמין.
        ההתראות האחרונות מחכות לך בטלגרם — והבוט ימשיך לסרוק ברגע שהחיבור יחזור.
      </p>
      <a
        href="/"
        className="mx-auto mt-2 inline-flex items-center justify-center rounded-badge bg-accent px-5 py-2.5 text-sm font-semibold text-white"
      >
        נסה שוב
      </a>
    </div>
  );
}

"use client";

// A server hiccup must stay inside the app's frame — the unstyled Next error
// page reads as "the app is broken", one tap of retry usually isn't.
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto grid min-h-[60dvh] max-w-sm place-content-center gap-3 text-center">
      <div className="text-4xl">🔧</div>
      <h1 className="text-xl font-bold">משהו השתבש</h1>
      <p className="text-sm leading-relaxed text-muted">
        השרת נתקל בשגיאה. לרוב ניסיון נוסף פותר את זה.
      </p>
      {error?.message && <p className="text-xs text-faint">{error.message.slice(0, 140)}</p>}
      <button
        onClick={reset}
        className="mx-auto mt-2 inline-flex items-center justify-center rounded-badge bg-accent px-5 py-2.5 text-sm font-semibold text-white"
      >
        נסה שוב
      </button>
    </div>
  );
}

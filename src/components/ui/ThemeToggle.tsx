"use client";

// Light/dark toggle. The inline script in layout.tsx applies the stored choice
// pre-paint; this component just flips + persists it. With no stored choice the
// OS preference rules (via the media-query token block).
import { useEffect, useState } from "react";
import Icon from "./Icon";

function resolvedTheme(): "light" | "dark" {
  const forced = document.documentElement.dataset.theme;
  if (forced === "light" || forced === "dark") return forced;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => setTheme(resolvedTheme()), []);

  function toggle() {
    const next = resolvedTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("re-theme", next);
    } catch {}
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
      aria-label={theme === "dark" ? "עבור למצב בהיר" : "עבור למצב כהה"}
      className="rounded-full border border-line bg-card p-2 text-muted transition-colors hover:text-ink hover:border-faint"
    >
      {/* render both, CSS-free swap after mount avoids hydration mismatch */}
      {theme === null ? <Icon name="moon" /> : <Icon name={theme === "dark" ? "sun" : "moon"} />}
    </button>
  );
}

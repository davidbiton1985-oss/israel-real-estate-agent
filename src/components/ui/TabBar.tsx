"use client";

// Bottom tab bar — the app's primary navigation on phones (hidden on desktop,
// where the header NavLinks take over). Mirrors NavLinks' active logic and
// pads for the iPhone home indicator via safe-area-inset.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "ראשי", icon: "home" },
  { href: "/matches", label: "התאמות", icon: "spark" },
  { href: "/profiles/new", label: "פרופיל", icon: "filter" },
  { href: "/add-listing", label: "הוספה", icon: "plus" },
];

export default function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-linestrong bg-card px-1 pt-1.5 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] sm:hidden"
      style={{ paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))" }}
    >
      {TABS.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[10.5px] font-semibold transition-all active:scale-95 ${
              active ? "text-accent" : "text-faint hover:text-ink"
            }`}
          >
            <Icon name={t.icon} size={20} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

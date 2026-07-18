"use client";

// V3 navigation: a floating glass dock (capsule) centered above the safe
// area — replaces the full-width tab bar. Four destinations; the pursuit is
// promoted to the dock because chasing is the second half of the product.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";

const ITEMS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "בית", icon: "home" },
  { href: "/matches", label: "הכל", icon: "search" },
  { href: "/pursuit", label: "בטיפול", icon: "bell" },
  { href: "/profile", label: "פרופיל", icon: "filter" },
];

export default function Dock() {
  const pathname = usePathname();
  // The listing page carries its own sticky action bar (call/WhatsApp/ad) —
  // the dock steps aside there; the back-chip returns to the gallery.
  if (pathname.startsWith("/listing/")) return null;
  return (
    <nav
      aria-label="ניווט ראשי"
      className="fixed left-1/2 z-50 flex -translate-x-1/2 gap-1.5 rounded-full p-2 shadow-lift backdrop-blur-xl sm:hidden"
      style={{
        bottom: "calc(14px + env(safe-area-inset-bottom))",
        background: "var(--glass)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      {ITEMS.map((t) => {
        const active =
          t.href === "/"
            ? pathname === "/" || pathname.startsWith("/listing")
            : pathname.startsWith(t.href) || (t.href === "/profile" && pathname.startsWith("/profiles"));
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex w-16 flex-col items-center gap-0.5 rounded-full py-2 text-[10px] font-semibold transition-all active:scale-95 ${
              active ? "bg-ink text-white" : "text-muted"
            }`}
          >
            <Icon name={t.icon} size={19} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

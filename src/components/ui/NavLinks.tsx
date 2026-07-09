"use client";

// Header nav with an active-page state — you should always know where you are.
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon, { type IconName } from "./Icon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "דשבורד", icon: "home" },
  { href: "/matches", label: "התאמות", icon: "spark" },
  { href: "/profiles/new", label: "פרופיל חדש", icon: "plus" },
  { href: "/add-listing", label: "הוספה ידנית", icon: "pencil" },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
              active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-card2 hover:text-ink"
            }`}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

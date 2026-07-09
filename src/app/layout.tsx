import type { Metadata } from "next";
import Link from "next/link";
import { Heebo, Frank_Ruhl_Libre } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ui/ThemeToggle";
import Icon from "@/components/ui/Icon";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-body",
  display: "swap",
});

const frankRuhl = Frank_Ruhl_Libre({
  subsets: ["hebrew", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "סוכן הנדל״ן",
  description: "סוכן חיפוש דירות אישי — סורק, מנקד ושולח התראות וואטסאפ",
};

// Applies the stored theme before first paint so there's no flash; with no
// stored choice, the OS preference rules via the media-query token block.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("re-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t}}catch(e){}})()`;

const NAV = [
  { href: "/", label: "דשבורד", icon: "home" as const },
  { href: "/matches", label: "התאמות", icon: "spark" as const },
  { href: "/profiles/new", label: "פרופיל חדש", icon: "plus" as const },
  { href: "/add-listing", label: "הוספה ידנית", icon: "pencil" as const },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${frankRuhl.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-line bg-card/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2 text-accent">
              <Icon name="home" size={22} />
              <span className="font-display text-lg font-bold text-ink">סוכן הנדל״ן</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-muted transition-colors hover:bg-card2 hover:text-ink"
                >
                  <Icon name={item.icon} size={15} />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="ms-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-8 pt-4 text-center text-xs text-faint">
          סוכן נדל״ן אישי · רץ מקומית על המחשב שלך
        </footer>
      </body>
    </html>
  );
}

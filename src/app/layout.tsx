import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Rubik } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ui/ThemeToggle";
import NavLinks from "@/components/ui/NavLinks";
import TabBar from "@/components/ui/TabBar";

// One face carries the whole app: Rubik — the Israeli geometric Hebrew sans.
// Display roles use the heavy weights; body text the regular/medium.
const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: { template: "%s · סוכן הנדל״ן", default: "סוכן הנדל״ן" },
  description: "סוכן חיפוש דירות אישי — סורק, מנקד ושולח התראות בטלגרם",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "סוכן הנדל״ן",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover", // draw under the iPhone home indicator; TabBar pads via safe-area
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eceef1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1220" },
  ],
};

// Applies the stored theme before first paint so there's no flash; with no
// stored choice, the OS preference rules via the media-query token block.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("re-theme");if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t}}catch(e){}})()`;

/** The Bauhaus mark: three balcony ribbons on an ultramarine block. */
function LogoMark() {
  return (
    <span
      aria-hidden="true"
      className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px_8px_8px_14px] bg-accent"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="12" height="2.2" rx="1.1" fill="var(--accent-ink)" />
        <rect x="2" y="7" width="9" height="2.2" rx="1.1" fill="var(--accent-ink)" opacity="0.78" />
        <rect x="2" y="11" width="12" height="2.2" rx="1.1" fill="var(--accent-ink)" />
      </svg>
    </span>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable}`} style={{ ["--font-display" as string]: "var(--font-body)" }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[17px] font-extrabold tracking-tight text-ink">סוכן הנדל״ן</span>
            </Link>
            <div className="max-sm:hidden">
              <NavLinks />
            </div>
            <div className="ms-auto">
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-24 pt-4 text-center text-xs text-faint sm:pb-8">
          סוכן נדל״ן אישי · רץ מקומית על המחשב שלך · התראות בטלגרם
        </footer>
        <TabBar />
      </body>
    </html>
  );
}

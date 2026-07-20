import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Assistant, Secular_One } from "next/font/google";
import "./globals.css";
import NavLinks from "@/components/ui/NavLinks";
import Dock from "@/components/ui/Dock";
import AutoRefresh from "@/components/ui/AutoRefresh";
import SwNavigate from "@/components/ui/SwNavigate";
import BotonMark from "@/components/ui/BotonMark";

// V3 "הגלריה" pairing: Assistant carries the Hebrew UI; Secular One is the
// display voice — prices, scores, titles — used sparingly and never small.
const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
const secular = Secular_One({
  subsets: ["hebrew", "latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: { template: "%s · Boton", default: "Boton — בוט אמריקאי מבית ביטון" },
  description: "Boton — סוכן חיפוש דירות אישי. סורק, מנקד ושולח התראות לנייד.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Boton",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#f6f5f2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${secular.variable}`}>
      <body className="min-h-screen">
        <AutoRefresh />
        <SwNavigate />
        {/* Desktop-only slim header; on the phone the gallery carries the
            brand and the floating dock carries navigation. */}
        <header className="sticky top-0 z-20 bg-bg/90 backdrop-blur max-sm:hidden">
          <div className="mx-auto flex min-h-[54px] max-w-6xl items-center gap-5 px-6 py-2">
            <Link href="/" className="flex items-center gap-2.5">
              <BotonMark size={28} />
              <span className="display text-[19px]" dir="ltr">
                Boton
              </span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-[10px] pb-32 pt-2 sm:px-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-32 pt-4 text-center text-xs text-faint sm:pb-8">
          Boton · בוט אמריקאי מבית ביטון · סורק כל 5 דקות
        </footer>
        <Dock />
      </body>
    </html>
  );
}

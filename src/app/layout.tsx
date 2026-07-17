import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Heebo, Figtree } from "next/font/google";
import "./globals.css";
import NavLinks from "@/components/ui/NavLinks";
import TabBar from "@/components/ui/TabBar";
import AutoRefresh from "@/components/ui/AutoRefresh";
import LandingMark from "@/components/ui/LandingMark";

// monday-style pairing: Heebo carries the Hebrew UI, Figtree carries the
// Latin wordmark and numerals.
const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-latin",
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
  viewportFit: "cover", // draw under the iPhone home indicator; TabBar pads via safe-area
  themeColor: "#f6f7fb",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${figtree.variable}`}>
      <body className="min-h-screen">
        <AutoRefresh />
        {/* Desktop-only slim header; on the phone the dashboard hero carries
            the brand and the TabBar carries navigation. */}
        <header className="sticky top-0 z-20 border-b border-line bg-card/95 backdrop-blur max-sm:hidden">
          <div className="mx-auto flex min-h-[52px] max-w-6xl items-center gap-5 px-6 py-2">
            <Link href="/" className="flex items-center gap-2">
              <LandingMark size={26} />
              <span className="figtree text-[19px] font-bold tracking-tight" dir="ltr">
                Boton
              </span>
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5 pb-24 sm:px-6 sm:py-8 sm:pb-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-24 pt-4 text-center text-xs text-faint sm:pb-8">
          Boton · בוט אמריקאי מבית ביטון · סורק כל 5 דקות · התראות בטלגרם ולמסך הנעילה
        </footer>
        <TabBar />
      </body>
    </html>
  );
}

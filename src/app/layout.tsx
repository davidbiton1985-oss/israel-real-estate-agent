import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Israel Real Estate Agent",
  description: "Personal real-estate search & alert agent (local)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <nav className="bg-slate-900 text-white px-6 py-3 flex items-center gap-6">
          <span className="font-bold">🏠 RE Agent</span>
          <Link href="/" className="hover:underline">Dashboard</Link>
          <Link href="/profiles/new" className="hover:underline">New Profile</Link>
          <Link href="/add-listing" className="hover:underline">Manual Add (fallback)</Link>
          <Link href="/matches" className="hover:underline">Matches</Link>
        </nav>
        <main className="max-w-5xl mx-auto p-6">{children}</main>
      </body>
    </html>
  );
}

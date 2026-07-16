import type { MetadataRoute } from "next";

// Web app manifest — lets iOS/Android install the dashboard as a standalone
// app ("Add to Home Screen"). Icons come from scripts/generate-pwa-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "סוכן הנדל״ן",
    short_name: "סוכן הנדל״ן",
    description: "סוכן חיפוש דירות אישי — סורק, מנקד ושולח התראות בטלגרם",
    id: "/",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#eceef1",
    theme_color: "#eceef1",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

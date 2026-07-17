import type { MetadataRoute } from "next";

// Web app manifest — lets iOS/Android install the dashboard as a standalone
// app ("Add to Home Screen"). Icons come from scripts/generate-pwa-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Boton — בוט אמריקאי מבית ביטון",
    short_name: "Boton",
    description: "Boton — סוכן חיפוש דירות אישי. סורק, מנקד ושולח התראות לנייד.",
    id: "/",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#f6f7fb",
    theme_color: "#f6f7fb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

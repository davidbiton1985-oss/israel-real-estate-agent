import type { Config } from "tailwindcss";

// Semantic classes map to the "Boton on monday" tokens in globals.css.
// Component class names stay stable; only token values changed.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        card: "var(--card)",
        card2: "var(--card-2)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        line: "var(--line)",
        linestrong: "var(--line-strong)",
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
        },
        good: { DEFAULT: "var(--good)", soft: "var(--good-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        crit: { DEFAULT: "var(--crit)", soft: "var(--crit-soft)" },
        special: { DEFAULT: "var(--special)", soft: "var(--special-soft)" },
        myellow: "var(--yellow)",
      },
      fontFamily: {
        body: ["var(--font-body)", "Heebo", "sans-serif"],
        display: ["var(--font-body)", "Heebo", "sans-serif"],
        latin: ["var(--font-latin)", "Figtree", "sans-serif"],
      },
      borderRadius: {
        badge: "4px",
        xl2: "8px", // monday card radius
      },
      boxShadow: {
        card: "var(--shadow-sm)",
        lift: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};
export default config;

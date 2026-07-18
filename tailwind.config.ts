import type { Config } from "tailwindcss";

// Semantic classes map to the V3 "הגלריה" tokens in globals.css.
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
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          soft: "var(--accent-soft)",
          ink: "var(--accent-ink)",
        },
        good: { DEFAULT: "var(--good)", soft: "var(--good-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        crit: { DEFAULT: "var(--crit)", soft: "var(--crit-soft)" },
      },
      fontFamily: {
        body: ["var(--font-body)", "Assistant", "sans-serif"],
        display: ["var(--font-display)", "Secular One", "serif"],
      },
      borderRadius: {
        badge: "10px",
        xl2: "20px", // gallery card radius
        sheet: "26px",
      },
      boxShadow: {
        card: "var(--shadow-ambient)",
        lift: "var(--shadow-dock)",
      },
    },
  },
  plugins: [],
};
export default config;

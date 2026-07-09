import type { Config } from "tailwindcss";

// Semantic colors map to the token custom properties in globals.css — the same
// class renders correctly in light and dark because the tokens flip, not the CSS.
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
        body: ["var(--font-body)", "Heebo", "sans-serif"],
        display: ["var(--font-display)", "Frank Ruhl Libre", "serif"],
      },
      borderRadius: {
        xl2: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(43 33 24 / 0.04), 0 1px 6px -1px rgb(43 33 24 / 0.06)",
        lift: "0 4px 16px -4px rgb(43 33 24 / 0.12)",
      },
    },
  },
  plugins: [],
};
export default config;

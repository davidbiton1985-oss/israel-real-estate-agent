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
        body: ["var(--font-body)", "Rubik", "sans-serif"],
        display: ["var(--font-display)", "Rubik", "sans-serif"],
      },
      borderRadius: {
        xl2: "0.625rem",
        /* Bauhaus balcony corner — one rounded corner per card (physical
           corners; the app is always RTL so bottom-left is the end corner). */
        balc: "6px 6px 6px 26px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(19 26 42 / 0.05), 0 8px 28px -12px rgb(19 26 42 / 0.10)",
        lift: "0 4px 18px -4px rgb(19 26 42 / 0.16)",
      },
    },
  },
  plugins: [],
};
export default config;

// Manually re-score all listings against the current active-profile criteria
// (also runs automatically on every profile save). Sends no alerts — newly
// qualifying items surface via the review digest.
import { readFileSync } from "fs";
import { rescoreAll } from "../src/core/rescore";
import { prisma } from "../src/lib/db";

function loadEnv() {
  try {
    for (const line of readFileSync(".env", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env optional */
  }
}

async function main() {
  loadEnv();
  const r = await rescoreAll();
  console.log(`[rescore] profiles=${r.profiles} listings=${r.listings} statusChanged=${r.statusChanged} newlyQualifying=${r.newlyQualifying}`);
}

main()
  .catch((e) => {
    console.error("[rescore]", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

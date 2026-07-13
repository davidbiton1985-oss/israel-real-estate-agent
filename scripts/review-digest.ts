// Runner for the review digest (launchd: com.david.review-digest, a few times
// a day). Pass --dry-run to preview without sending or marking anything.
// Standalone tsx doesn't load .env, so load it explicitly (like the watchdogs).
import { readFileSync } from "fs";
import { runReviewDigest } from "../src/core/reviewDigest";
import { prisma } from "../src/lib/db";

function loadEnv() {
  try {
    const env = readFileSync(".env", "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* .env optional */
  }
}

async function main() {
  loadEnv();
  const dryRun = process.argv.includes("--dry-run");
  const r = await runReviewDigest({ dryRun });
  if (r.pending === 0) console.log("[review-digest] nothing pending review");
  else console.log(`[review-digest] pending=${r.pending} included=${r.included} sent=${r.sent} via ${r.channel}`);
}

main()
  .catch((e) => {
    console.error("[review-digest]", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

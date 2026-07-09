// One-off cleanup for the tab-watcher < v1.1 bug: Yad2 captures where the whole
// results grid was stored as ONE listing (rawText holds several apartments), so
// the parsed fields and the stored URL belong to DIFFERENT apartments and the
// dashboard "Open listing" link pointed to the wrong post.
//
// Deletes YAD2 listings matching the same strict rule as the server guard
// (looksLikeMergedYad2Cards): ≥2 price tags AND ≥2 rooms tags. Match + Alert
// rows cascade (see prisma/schema.prisma). Correct replacements are re-captured
// by tab-watcher v1.1, whose rotated seen-key re-sends everything visible.
//
// Run: npx tsx scripts/cleanup-merged-yad2.ts
import { prisma } from "../src/lib/db";
import { looksLikeMergedYad2Cards } from "../src/core/capture";

async function main() {
  const yad2 = await prisma.listing.findMany({
    where: { source: "YAD2" },
    select: { id: true, url: true, price: true, rooms: true, city: true, rawText: true },
  });
  const merged = yad2.filter((l) => looksLikeMergedYad2Cards(l.rawText));

  console.log(`YAD2 listings: ${yad2.length} · merged-grid corrupt: ${merged.length}`);
  for (const l of merged) {
    console.log(`  deleting ${l.id} · ${l.city ?? "?"} · ₪${l.price ?? "?"} · ${l.rooms ?? "?"} rooms · ${l.url ?? "no url"}`);
  }

  if (merged.length > 0) {
    const res = await prisma.listing.deleteMany({ where: { id: { in: merged.map((l) => l.id) } } });
    console.log(`Deleted ${res.count} listings (matches + alerts cascaded).`);
  } else {
    console.log("Nothing to delete.");
  }

  // Post-check: the rule must now match zero YAD2 rows.
  const remaining = (await prisma.listing.findMany({ where: { source: "YAD2" }, select: { rawText: true } })).filter((l) =>
    looksLikeMergedYad2Cards(l.rawText)
  ).length;
  console.log(`Remaining YAD2 listings matching the merged rule: ${remaining}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

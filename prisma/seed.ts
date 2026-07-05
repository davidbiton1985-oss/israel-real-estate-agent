// Seed: one demo profile + 7 Hebrew demo listings covering key scenarios.
// Listings are parsed + stored with scanned=false, so "Run scan now" processes them.
import { prisma } from "../src/lib/db";
import { ingestListing } from "../src/core/pipeline";

async function main() {
  const existing = await prisma.profile.findFirst({ where: { name: "4-room rental — Ganei Tikva area (demo)" } });
  if (existing) {
    console.log("Seed already applied — skipping. (Delete dev.db to re-seed.)");
    return;
  }

  await prisma.profile.create({
    data: {
      name: "4-room rental — Ganei Tikva area (demo)",
      dealType: "RENT",
      cities: "Ganei Tikva, Kiryat Ono, Petah Tikva",
      priceMax: 7500,
      roomsMin: 4,
      roomsMax: 5,
      balcony: "REQUIRED",
      parking: "PREFERRED",
      elevator: "INDIFFERENT",
      mamad: "INDIFFERENT",
      brokerStatusPref: "private_preferred_broker_allowed_if_strong_match",
      brokerFeePref: "unknown_allowed",
      whatsappThreshold: 80,
      dashboardThreshold: 60,
    },
  });
  console.log("✓ Demo profile created");

  const demoListings: { text: string; url: string | null; note: string }[] = [
    {
      note: "strong private match",
      url: "https://www.yad2.co.il/realestate/item/demo1abc",
      text: 'להשכרה בגני תקווה! דירת 4 חדרים משופצת, 100 מ"ר, מרפסת שמש גדולה, חניה בטאבו, קומה 2 עם מעלית, ממ"ד. ללא תיווך — ישירות מבעל הדירה. 7,200 ש"ח לחודש. כניסה מיידית!',
    },
    {
      note: "broker match (good apartment, broker listing)",
      url: null,
      text: 'להשכרה בקרית אונו — דירת 4 חדרים מהממת, 105 מ"ר, מרפסת, חניה כפולה, מעלית. משרד תיווך אלמוג נכסים, דמי תיווך חודש שכירות. 7,400 ₪. כניסה גמישה.',
    },
    {
      note: "too expensive → reject",
      url: null,
      text: 'להשכרה בפתח תקווה דירת 4 חדרים חדשה מקבלן, 110 מ"ר, מרפסת ענקית, 2 חניות, מעלית שבת, ממ"ד. 9,500 ש"ח לחודש. ללא תיווך.',
    },
    {
      note: "missing broker status",
      url: null,
      text: 'להשכרה בגני תקווה דירת 4 חדרים, 95 מ"ר, מרפסת יפה, קומה 3, מעלית. 7,000 ש"ח. כניסה ב-1.9.',
    },
    {
      note: "no balcony → reject (balcony required)",
      url: null,
      text: 'להשכרה בקרית אונו דירת 4 חדרים, 100 מ"ר, אין מרפסת, חניה, מעלית, ממ"ד. ללא תיווך. 6,900 ש"ח לחודש.',
    },
    {
      note: "possible duplicate (same Yad2 listing as #1)",
      url: "https://www.yad2.co.il/realestate/item/demo1abc",
      text: 'גני תקווה — 4 חדרים להשכרה, 100 מ"ר עם מרפסת שמש, חניה, מעלית, ממ"ד. בלי תיווך. 7,200 ₪. פנו עוד היום!',
    },
    {
      note: "wrong city → reject",
      url: null,
      text: 'להשכרה בהרצליה פיתוח! דירת 4 חדרים יוקרתית, 120 מ"ר, מרפסת עם נוף לים, חניה, מעלית. 7,300 ש"ח. ללא תיווך.',
    },
  ];

  for (const d of demoListings) {
    const listing = await ingestListing(d.text, "DEMO", d.url);
    console.log(`✓ Demo listing (${d.note})${listing.isDuplicateOf ? " [marked duplicate]" : ""}`);
  }

  console.log('\nSeed done. Start the app and click "Run scan now" to score the demo listings.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

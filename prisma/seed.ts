// Seed v2/v3: two demo profiles (rent + sale) + 12 realistic Hebrew demo listings,
// plus a scripted price-drop repost of listing #1 to demonstrate the re-alert path.
// To re-seed from scratch: rm prisma/dev.db && npx prisma migrate dev
import { prisma } from "../src/lib/db";
import { ingestListing, runScan } from "../src/core/pipeline";

const RENT_PROFILE = "4-room rental — Ganei Tikva area (demo)";
const SALE_PROFILE = "4-room purchase — Petah Tikva / Givat Shmuel (demo)";

async function main() {
  if (await prisma.profile.findFirst({ where: { name: SALE_PROFILE } })) {
    console.log("Seed v2 already applied — skipping. (rm prisma/dev.db && npx prisma migrate dev to re-seed.)");
    return;
  }

  if (!(await prisma.profile.findFirst({ where: { name: RENT_PROFILE } }))) {
    await prisma.profile.create({
      data: {
        name: RENT_PROFILE,
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
    console.log("✓ Rent demo profile created");
  }

  await prisma.profile.create({
    data: {
      name: SALE_PROFILE,
      dealType: "SALE",
      cities: "Petah Tikva, Givat Shmuel",
      priceMax: 2800000,
      roomsMin: 4,
      roomsMax: 5,
      balcony: "PREFERRED",
      parking: "PREFERRED",
      elevator: "PREFERRED",
      mamad: "PREFERRED",
      brokerStatusPref: "private_only",
      brokerFeePref: "unknown_allowed",
      whatsappThreshold: 80,
      dashboardThreshold: 60,
    },
  });
  console.log("✓ Sale demo profile created");

  const demoListings: { text: string; url: string | null; source: "YAD2" | "FACEBOOK" | "WHATSAPP" | "MANUAL" | "DEMO"; note: string }[] = [
    {
      note: "strong private Yad2 rental",
      source: "YAD2",
      url: "https://www.yad2.co.il/realestate/item/demo1abc",
      text: 'להשכרה בגני תקווה! דירת 4 חדרים משופצת ברחוב הזיתים, 100 מ"ר, מרפסת שמש גדולה, חניה בטאבו, קומה 2 מתוך 4 עם מעלית, ממ"ד ומחסן. ללא תיווך — ישירות מבעל הדירה. 7,200 ש"ח לחודש. ארנונה: 480, ועד בית: 120. כניסה מיידית!',
    },
    {
      note: "broker Yad2 rental",
      source: "YAD2",
      url: "https://www.yad2.co.il/realestate/item/brok77x",
      text: 'משרד תיווך אלמוג נכסים מציג: להשכרה בקרית אונו דירת 4 חדרים מהממת, 105 מ"ר, מרפסת, חניה כפולה, מעלית. דמי תיווך: חודש שכירות + מע"מ. 7,400 ₪. כניסה גמישה.',
    },
    {
      note: "private sale listing (matches sale profile)",
      source: "YAD2",
      url: "https://www.yad2.co.il/realestate/item/sale88q",
      text: 'למכירה בפתח תקווה, שכונת כפר גנים! דירת 4 חדרים, 108 מ"ר, קומה 3 מתוך 6, מרפסת שמש, חניה, מעלית, ממ"ד. משופצת מהיסוד. ללא תיווך! 2.45 מיליון. פינוי גמיש.',
    },
    {
      note: "Facebook post with missing fields",
      source: "FACEBOOK",
      url: null,
      text: "מחפשים שוכרים לדירה שלנו בגני תקווה 🙂 4 חדרים, כניסה בספטמבר. פרטים בהודעה פרטית.",
    },
    {
      note: "WhatsApp broker message",
      source: "WHATSAPP",
      url: null,
      text: 'היי, אני מתווכת באזור. יש לי בשבילכם דירת 4.5 חדרים בפתח תקווה, 115 מ"ר, מרפסת + חניה, קומה 5 עם מעלית. 7,300 ש"ח. עמלת תיווך חודש שכירות.',
    },
    {
      note: "no balcony → reject vs rent profile",
      source: "YAD2",
      url: null,
      text: 'להשכרה בקרית אונו דירת 4 חדרים, 100 מ"ר, אין מרפסת, חניה, מעלית, ממ"ד. ללא תיווך. 6,900 ש"ח לחודש.',
    },
    {
      note: "slightly above budget (within 5%) → possible",
      source: "YAD2",
      url: null,
      text: 'להשכרה בגני תקווה! דירת 4 חדרים מרווחת, 102 מ"ר, מרפסת, חניה, מעלית. בלי תיווך. 7,700 ש"ח. כניסה ב-1.9, גמיש.',
    },
    {
      note: "unknown broker status",
      source: "MANUAL",
      url: null,
      text: 'להשכרה בגני תקווה דירת 4 חדרים, 95 מ"ר, מרפסת יפה, קומה 3, מעלית. 7,000 ש"ח. כניסה ב-1.9. לפרטים: 050-1234567',
    },
    {
      note: "duplicate Yad2 listing (same ID as #1)",
      source: "YAD2",
      url: "https://www.yad2.co.il/realestate/item/demo1abc",
      text: 'גני תקווה — 4 חדרים להשכרה, 100 מ"ר עם מרפסת שמש, חניה, מעלית, ממ"ד. בלי תיווך. 7,200 ₪. פנו עוד היום!',
    },
    {
      note: "suspicious too-cheap listing",
      source: "FACEBOOK",
      url: null,
      text: 'דירת 4 חדרים להשכרה בגני תקווה, 100 מ"ר עם מרפסת וחניה. רק 2,900 ש"ח!! כניסה מיידית, למהירי החלטה.',
    },
    {
      note: 'listing with "לא למתווכים" (must be PRIVATE)',
      source: "FACEBOOK",
      url: null,
      text: 'להשכרה דירת 4 חדרים בקרית אונו, 98 מ"ר, מרפסת, חניה, מעלית. 7,100 ש"ח. לא למתווכים!!',
    },
    {
      note: 'listing with "ללא דמי תיווך" (PRIVATE + fee NONE)',
      source: "YAD2",
      url: "https://www.yad2.co.il/realestate/item/nofee55",
      text: 'להשכרה בפתח תקווה, דירת 4 חדרים ברחוב רוטשילד, 96 מ"ר, מרפסת, מעלית, ממ"ד. ללא דמי תיווך. 6,800 ש"ח. כניסה 15.8.',
    },
  ];

  for (const d of demoListings) {
    const { listing, isNew } = await ingestListing(d.text, d.source, d.url);
    console.log(`✓ [${d.source}] ${d.note}${isNew ? "" : " [updated existing listing in place]"} — broker=${listing.brokerStatus}(${listing.brokerConfidence})`);
  }

  // Scan now so the 12 listings above get their initial NEW_MATCH alerts (console
  // fallback if Twilio isn't configured) — this sets Match.lastAlertedPrice, which
  // the price-drop repost below needs in order to actually demonstrate PRICE_DROP.
  const firstScan = await runScan();
  console.log(`\n✓ Initial scan: ${firstScan.processed} listing(s) processed, ${firstScan.alertsSent} alert(s) sent (see console above).`);

  // Phase 3 demo: re-paste of listing #1 (same Yad2 ID, same URL) at a LOWER price.
  // Because listing #1 already has a lastAlertedPrice (₪7,200) from the scan above,
  // scanning this one triggers a real PRICE_DROP re-alert, not another NEW_MATCH.
  await ingestListing(
    'גני תקווה — 4 חדרים, 100 מ"ר עם מרפסת שמש, חניה בטאבו, מעלית, ממ"ד ומחסן, ללא תיווך. ירידת מחיר! עכשיו רק 6,900 ש"ח לחודש.',
    "YAD2",
    "https://www.yad2.co.il/realestate/item/demo1abc"
  );
  const dropScan = await runScan();
  console.log(`✓ Price-drop repost of listing #1 (₪7,200 → ₪6,900) scanned: ${dropScan.alertsSent} alert(s) sent — check for a "📉 Price drop detected" message above.`);

  console.log("\nSeed v2 done. Open the dashboard/Matches page to see all scored listings and their alert history.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

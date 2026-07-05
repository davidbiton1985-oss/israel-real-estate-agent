// Bilingual (HE/EN) Israeli real-estate listing parser. Regex/dictionary only — no LLM in MVP.
// Phase 2: hardened extraction (neighborhood/street/floors/storage/garden/condition/furnished/
// entry/arnona/vaad), robust broker classifier with confidence + evidence, better Yad2 IDs.

export type BrokerStatus = "PRIVATE" | "BROKER" | "UNKNOWN";
export type FeeStatus = "NONE" | "EXISTS" | "UNKNOWN";
export type Confidence = "high" | "medium" | "low";

export interface ParsedListing {
  dealType: "RENT" | "SALE" | null;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  price: number | null;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  totalFloors: number | null;
  balcony: boolean | null;
  parking: boolean | null;
  elevator: boolean | null;
  mamad: boolean | null;
  storage: boolean | null;
  garden: boolean | null;
  condition: "RENOVATED" | "NEW" | null;
  furnished: "FURNISHED" | "PARTIAL" | "UNFURNISHED" | null;
  propertyType: string | null;
  entryImmediate: boolean | null;
  entryFlexible: boolean | null;
  entryDate: string | null;
  arnonaMonthly: number | null;
  vaadMonthly: number | null;
  brokerStatus: BrokerStatus;
  brokerConfidence: Confidence;
  brokerEvidence: string | null;
  brokerFeeStatus: FeeStatus;
  brokerFeeText: string | null;
  yad2ListingId: string | null;
}

// Pre-seeded cities (Gush Dan + Sharon) with HE/EN aliases. Any city can be typed manually in profiles.
export const CITIES: { canonical: string; aliases: string[] }[] = [
  { canonical: "Ganei Tikva", aliases: ["גני תקווה", "גני תקוה", "ganei tikva", "ganei tikvah"] },
  { canonical: "Kiryat Ono", aliases: ["קרית אונו", "קריית אונו", "kiryat ono"] },
  { canonical: "Petah Tikva", aliases: ["פתח תקווה", "פתח תקוה", 'פ"ת', "פ״ת", "petah tikva", "petach tikva"] },
  { canonical: "Givat Shmuel", aliases: ["גבעת שמואל", "givat shmuel"] },
  { canonical: "Ramat Gan", aliases: ["רמת גן", 'ר"ג', "ר״ג", "ramat gan"] },
  { canonical: "Tel Aviv", aliases: ["תל אביב", 'ת"א', "ת״א", "תל-אביב", "tel aviv"] },
  { canonical: "Ramat HaSharon", aliases: ["רמת השרון", "ramat hasharon"] },
  { canonical: "Herzliya", aliases: ["הרצליה", "herzliya", "herzliyya"] },
  { canonical: "Hod HaSharon", aliases: ["הוד השרון", "hod hasharon"] },
  { canonical: "Raanana", aliases: ["רעננה", "raanana", "ra'anana"] },
  { canonical: "Yehud-Monosson", aliases: ["יהוד מונוסון", "יהוד-מונוסון", "יהוד", "yehud"] },
  { canonical: "Or Yehuda", aliases: ["אור יהודה", "or yehuda"] },
];

// ---------------------------------------------------------------------------
// Phrase matching with Hebrew "word boundaries": a Hebrew letter must not be
// glued directly before/after the phrase. Prevents e.g. פרטי matching לפרטים,
// or ללת matching כוללת.
// ---------------------------------------------------------------------------
const HEB = "א-ת";

function normalizeQuotes(s: string): string {
  // Unify gershayim/geresh variants so ממ"ד == ממ״ד == ממ''ד etc.
  return s.replace(/[״“”„]/g, '"').replace(/[׳‘’`]/g, "'");
}

function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![${HEB}A-Za-z])${escaped}(?![${HEB}A-Za-z])`, "i");
}

// Allows 1–2 attached Hebrew prefix letters (ו/ב/ל/מ/ה/כ/ש): matches בגני תקווה,
// ומחסן, להרצליה… Used for cities/features only — NOT for broker phrases, where
// prefix tolerance would create false positives on short abbreviations.
function prefixedPhraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![${HEB}A-Za-z])[ובלמהכש]{0,2}${escaped}(?![${HEB}A-Za-z])`, "i");
}

function findPhrase(text: string, phrases: string[]): string | null {
  for (const p of phrases) {
    if (phraseRegex(normalizeQuotes(p)).test(text)) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Broker classification. Private/negation phrases are checked FIRST and WIN
// over broker substrings ("ללא תיווך" → PRIVATE; "לא למתווכים" → PRIVATE).
// ---------------------------------------------------------------------------
const PRIVATE_HIGH = [
  "ללא תיווך", "בלי תיווך", "לא תיווך", "לא מתיווך", "לא למתווכים",
  "ללא עמלת תיווך", "ללא דמי תיווך", 'לל"ת', "ללת",
  "ישירות מבעל הדירה", "ישירות מהבעלים", "מבעל הדירה", "מהבעלים",
  "no broker", "owner direct", "private listing", "no agent",
];
const PRIVATE_MEDIUM = ["מפרטי", "פרטי"];

const BROKER_HIGH = ["משרד תיווך", "עמלת תיווך", "דמי תיווך", "brokerage fee", "מתווכת", "מתווך"];
const BROKER_MEDIUM = ["מתיווך", "תיווך", "broker", "realtor", "agency", "agent"];

const FEE_NONE = ["ללא עמלת תיווך", "ללא דמי תיווך", "ללא עמלה", "no fee"];
const FEE_EXISTS = ["עמלת תיווך", "דמי תיווך", "brokerage fee"];

export function classifyBroker(text: string): {
  status: BrokerStatus;
  confidence: Confidence;
  evidence: string | null;
  feeStatus: FeeStatus;
  feeText: string | null;
} {
  const norm = normalizeQuotes(text);

  // Fee (independent of status). "ללא דמי תיווך" → NONE wins over the EXISTS substring.
  let feeStatus: FeeStatus = "UNKNOWN";
  let feeText: string | null = null;
  const feeNone = findPhrase(norm, FEE_NONE);
  if (feeNone) {
    feeStatus = "NONE";
    feeText = feeNone;
  } else {
    const feeHit = findPhrase(norm, FEE_EXISTS);
    if (feeHit) {
      feeStatus = "EXISTS";
      // Try to capture what follows the fee phrase (amount / "חודש שכירות" etc.)
      const m = norm.match(new RegExp(`(?:דמי|עמלת)\\s+תיווך[:\\s]*([^\\n,.!]{0,40})`));
      feeText = m && m[1].trim() ? `${feeHit} ${m[1].trim()}`.trim() : feeHit;
    }
  }

  // Status: private phrases override broker substring matches.
  const privHigh = findPhrase(norm, PRIVATE_HIGH);
  if (privHigh) return { status: "PRIVATE", confidence: "high", evidence: privHigh, feeStatus, feeText };
  // "בית פרטי" is a property type (private house), not a no-broker signal — mask it
  // before checking the weaker "פרטי" signal.
  const normNoHouse = norm.replace(/בית פרטי/g, "");
  const privMed = findPhrase(normNoHouse, PRIVATE_MEDIUM);
  if (privMed) return { status: "PRIVATE", confidence: "medium", evidence: privMed, feeStatus, feeText };

  const brokHigh = findPhrase(norm, BROKER_HIGH);
  if (brokHigh) return { status: "BROKER", confidence: "high", evidence: brokHigh, feeStatus, feeText };
  const brokMed = findPhrase(norm, BROKER_MEDIUM);
  if (brokMed) return { status: "BROKER", confidence: "medium", evidence: brokMed, feeStatus, feeText };

  return { status: "UNKNOWN", confidence: "low", evidence: null, feeStatus, feeText };
}

// ---------------------------------------------------------------------------
// Yad2 listing ID. Best-effort — exact URL formats vary; assumptions documented:
//   https://www.yad2.co.il/realestate/item/<token>        (current format)
//   https://www.yad2.co.il/item/<token>
//   .../item/<token>?opened-from=...                      (query suffixes)
//   legacy: ...yad2.co.il/...?id=<token> or &itemId=<token>
// Tokens are alphanumeric (Yad2 uses short alphanumeric ids).
// ---------------------------------------------------------------------------
export function extractYad2Id(url: string | null, text: string): string | null {
  for (const s of [url ?? "", text]) {
    if (!s) continue;
    const m1 = s.match(/yad2\.co\.il\/(?:[a-z-]+\/)*item\/([A-Za-z0-9]+)/i);
    if (m1) return m1[1];
    if (/yad2/i.test(s)) {
      const m2 = s.match(/[?&](?:itemId|id)=([A-Za-z0-9]+)/i);
      if (m2) return m2[1];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Numeric extraction helpers
// ---------------------------------------------------------------------------
function toInt(s: string): number {
  return parseInt(s.replace(/[,.\s]/g, ""), 10);
}

function extractPrice(text: string): number | null {
  const norm = normalizeQuotes(text);
  // Millions first: "2.45 מיליון" / "1.5M"
  const mil = norm.match(/(\d+(?:\.\d+)?)\s*(?:מיליון|million|M\b)/i);
  if (mil) {
    const n = Math.round(parseFloat(mil[1]) * 1_000_000);
    if (n >= 100_000) return n;
  }
  const patterns = [
    /₪\s?([\d,]+(?:\.\d{3})*)/,
    /([\d,]{3,}(?:\.\d{3})*)\s?₪/,
    /([\d,]{3,})\s?ש"?ח/, // ש"ח / שח (norm already unified ״→")
    /nis\s?([\d,]+)/i,
    /מחיר[:\s]+([\d,]+)/,
    /שכירות[:\s]+([\d,]+)/,
    /price[:\s]+([\d,]+)/i,
  ];
  for (const re of patterns) {
    const m = norm.match(re);
    if (m) {
      const n = toInt(m[1]);
      if (!isNaN(n) && n >= 500) return n;
    }
  }
  return null;
}

function extractRooms(text: string): number | null {
  const norm = normalizeQuotes(text);
  const patterns = [
    /(\d+(?:[.,]5)?)\s*חדרים/,
    /(\d+(?:[.,]5)?)\s*(?:חד|דח)'?(?![א-ת])/u,
    /דירת\s+(\d+(?:[.,]5)?)(?!\s*(?:מ"ר|מטר|קומות))/,
    /(\d+(?:[.,]5)?)\s*rooms?/i,
  ];
  for (const re of patterns) {
    const m = norm.match(re);
    if (m) {
      const n = parseFloat(m[1].replace(",", "."));
      if (n > 0 && n <= 12) return n;
    }
  }
  return null;
}

function extractSize(text: string): number | null {
  const norm = normalizeQuotes(text);
  const m = norm.match(/(\d{2,4})\s*(?:מ"ר|מ'?ר\b|מטר(?:ים)?(?:\s+רבועים?)?|sqm|m2|m²)/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 15 && n <= 2000) return n;
  }
  return null;
}

function extractFloors(text: string): { floor: number | null; totalFloors: number | null } {
  const norm = normalizeQuotes(text);
  if (/ק"ק|קומת קרקע|\bקרקע\b/.test(norm)) {
    const t = norm.match(/(?:מתוך|\/)\s*(\d+)/);
    return { floor: 0, totalFloors: t ? parseInt(t[1], 10) : null };
  }
  // "קומה 3 מתוך 5" / "קומה 3/5" / "ק' 3" / "floor 3 of 5"
  const m =
    norm.match(/קומה\s*(\d+)\s*(?:מתוך|\/)\s*(\d+)/) ??
    norm.match(/floor\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
  if (m) return { floor: parseInt(m[1], 10), totalFloors: parseInt(m[2], 10) };
  const single =
    norm.match(/קומה\s*(\d+)/) ?? norm.match(/ק['׳]\s*(\d+)/) ?? norm.match(/floor\s*(\d+)/i) ?? norm.match(/(\d+)(?:st|nd|rd|th)\s+floor/i);
  const total = norm.match(/בניין\s+(?:בן\s+)?(\d+)\s+קומות/) ?? norm.match(/(\d+)[-\s]stor(?:y|ey)/i);
  return {
    floor: single ? parseInt(single[1], 10) : null,
    totalFloors: total ? parseInt(total[1], 10) : null,
  };
}

function extractBool(text: string, positives: string[], negatives: string[]): boolean | null {
  const norm = normalizeQuotes(text);
  for (const n of negatives) if (prefixedPhraseRegex(normalizeQuotes(n)).test(norm)) return false;
  for (const p of positives) if (prefixedPhraseRegex(normalizeQuotes(p)).test(norm)) return true;
  return null;
}

function extractDealType(text: string): "RENT" | "SALE" | null {
  if (/להשכרה|השכרה|שכירות|לשכירות|for rent|monthly rent/i.test(text)) return "RENT";
  if (/למכירה|נמכרת|מכירה|for sale/i.test(text)) return "SALE";
  return null;
}

function extractCity(text: string): string | null {
  const norm = normalizeQuotes(text);
  for (const c of CITIES) {
    for (const alias of c.aliases) {
      if (prefixedPhraseRegex(normalizeQuotes(alias)).test(norm)) return c.canonical;
    }
  }
  return null;
}

function extractNeighborhood(text: string): string | null {
  const m = normalizeQuotes(text).match(/ב?שכונ(?:ה|ת)\s+([א-ת'" -]{2,25}?)(?=\s*[,.!\n:;()]|$)/u);
  return m ? m[1].trim() : null;
}

function extractStreet(text: string): string | null {
  const m = normalizeQuotes(text).match(/(?:ברחוב|רחוב|ברח'|רח')\s+([א-ת'" -]{2,25}?)(?=\s*\d|\s*[,.!\n:;()]|$)/u);
  return m ? m[1].trim() : null;
}

function extractCondition(text: string): "RENOVATED" | "NEW" | null {
  if (/חדשה?\s+מקבלן|פרויקט חדש|בנייה חדשה|new from contractor|brand new/i.test(text)) return "NEW";
  if (/משופצת|משופץ|שופצה|renovated/i.test(text)) return "RENOVATED";
  return null;
}

function extractFurnished(text: string): "FURNISHED" | "PARTIAL" | "UNFURNISHED" | null {
  const norm = normalizeQuotes(text);
  if (/ריהוט חלקי|מרוהטת חלקית|partially furnished/i.test(norm)) return "PARTIAL";
  if (/ללא ריהוט|לא מרוהטת|לא מרוהט|unfurnished/i.test(norm)) return "UNFURNISHED";
  if (/מרוהטת|מרוהט|כולל ריהוט|furnished/i.test(norm)) return "FURNISHED";
  return null;
}

function extractEntry(text: string): { immediate: boolean | null; flexible: boolean | null; date: string | null } {
  const norm = normalizeQuotes(text);
  const immediate = /כניסה מיידית|מיידי|immediate/i.test(norm) ? true : null;
  const flexible = /גמיש|flexible/i.test(norm) ? true : null;
  // "כניסה ב-1.9" / "כניסה: 01/09/26" / "פינוי 1.9.26"
  const m = norm.match(/(?:כניסה|פינוי)\s*:?\s*ב?[-\s]?(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/);
  return { immediate, flexible, date: m ? m[1] : null };
}

function extractMonthlyCost(text: string, keywords: RegExp): number | null {
  const m = normalizeQuotes(text).match(keywords);
  if (m) {
    const n = toInt(m[1]);
    if (!isNaN(n) && n > 0 && n < 100_000) return n;
  }
  return null;
}

function extractPropertyType(text: string): string | null {
  if (/פנטהאוז|penthouse/i.test(text)) return "PENTHOUSE";
  if (/דירת גן|garden apartment/i.test(text)) return "GARDEN_APT";
  if (/בית פרטי|קוטג|וילה|villa|cottage|\bhouse\b/i.test(text)) return "HOUSE";
  if (/דופלקס|duplex/i.test(text)) return "DUPLEX";
  if (/סטודיו|studio/i.test(text)) return "STUDIO";
  if (/דירה|apartment|\bapt\b/i.test(text)) return "APARTMENT";
  return null;
}

// ---------------------------------------------------------------------------
export function parseListing(rawText: string, url: string | null = null): ParsedListing {
  const broker = classifyBroker(rawText);
  const floors = extractFloors(rawText);
  const entry = extractEntry(rawText);
  return {
    dealType: extractDealType(rawText),
    city: extractCity(rawText),
    neighborhood: extractNeighborhood(rawText),
    street: extractStreet(rawText),
    price: extractPrice(rawText),
    rooms: extractRooms(rawText),
    sizeSqm: extractSize(rawText),
    floor: floors.floor,
    totalFloors: floors.totalFloors,
    balcony: extractBool(rawText, ["מרפסת", "balcony"], ["ללא מרפסת", "אין מרפסת", "no balcony"]),
    parking: extractBool(
      rawText,
      ["חניה", "חנייה", "חניית", "חנית", "parking"],
      ["ללא חניה", "אין חניה", "ללא חנייה", "אין חנייה", "no parking"]
    ),
    elevator: extractBool(rawText, ["מעלית", "elevator", "lift"], ["ללא מעלית", "אין מעלית", "no elevator"]),
    mamad: extractBool(rawText, ['ממ"ד', "ממד", "חדר ביטחון", "safe room", "mamad"], ['ללא ממ"ד', 'אין ממ"ד', "אין ממד", "ללא ממד"]),
    storage: extractBool(rawText, ["מחסן", "storage room"], ["ללא מחסן", "אין מחסן"]),
    garden: extractBool(rawText, ["גינה", "גינת", "חצר", "garden", "yard"], ["ללא גינה", "אין גינה"]),
    condition: extractCondition(rawText),
    furnished: extractFurnished(rawText),
    propertyType: extractPropertyType(rawText),
    entryImmediate: entry.immediate,
    entryFlexible: entry.flexible,
    entryDate: entry.date,
    arnonaMonthly: extractMonthlyCost(rawText, /ארנונה\s*:?\s*כ?[-\s]?([\d,]+)/),
    vaadMonthly: extractMonthlyCost(rawText, /(?:ועד\s*בית|ו\.בית|ועד)\s*:?\s*כ?[-\s]?([\d,]+)/),
    brokerStatus: broker.status,
    brokerConfidence: broker.confidence,
    brokerEvidence: broker.evidence,
    brokerFeeStatus: broker.feeStatus,
    brokerFeeText: broker.feeText,
    yad2ListingId: extractYad2Id(url, rawText),
  };
}

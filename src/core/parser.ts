// Lean bilingual (HE/EN) listing text parser. Regex/dictionary only — no LLM in MVP.

export type BrokerStatus = "PRIVATE" | "BROKER" | "UNKNOWN";
export type FeeStatus = "NONE" | "EXISTS" | "UNKNOWN";

export interface ParsedListing {
  dealType: "RENT" | "SALE" | null;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  rooms: number | null;
  sizeSqm: number | null;
  floor: number | null;
  balcony: boolean | null;
  parking: boolean | null;
  elevator: boolean | null;
  mamad: boolean | null;
  propertyType: string | null;
  entryImmediate: boolean | null;
  brokerStatus: BrokerStatus;
  brokerEvidence: string | null;
  brokerFeeStatus: FeeStatus;
  brokerFeeText: string | null;
  yad2ListingId: string | null;
}

// Pre-seeded cities (Gush Dan + Sharon) with HE/EN aliases. Any city can be typed manually in profiles.
export const CITIES: { canonical: string; aliases: string[] }[] = [
  { canonical: "Ganei Tikva", aliases: ["גני תקווה", "גני תקוה", "ganei tikva", "ganei tikvah"] },
  { canonical: "Kiryat Ono", aliases: ["קרית אונו", "קריית אונו", "kiryat ono"] },
  { canonical: "Petah Tikva", aliases: ["פתח תקווה", "פתח תקוה", "פ\"ת", "petah tikva", "petach tikva"] },
  { canonical: "Givat Shmuel", aliases: ["גבעת שמואל", "givat shmuel"] },
  { canonical: "Ramat Gan", aliases: ["רמת גן", "ר\"ג", "ramat gan"] },
  { canonical: "Tel Aviv", aliases: ["תל אביב", "ת\"א", "תל-אביב", "tel aviv"] },
  { canonical: "Ramat HaSharon", aliases: ["רמת השרון", "ramat hasharon"] },
  { canonical: "Herzliya", aliases: ["הרצליה", "herzliya", "herzliyya"] },
  { canonical: "Hod HaSharon", aliases: ["הוד השרון", "hod hasharon"] },
  { canonical: "Raanana", aliases: ["רעננה", "raanana", "ra'anana"] },
  { canonical: "Yehud-Monosson", aliases: ["יהוד מונוסון", "יהוד-מונוסון", "יהוד", "yehud"] },
  { canonical: "Or Yehuda", aliases: ["אור יהודה", "or yehuda"] },
];

// Broker classification dictionaries. Private/negation phrases are checked FIRST
// (e.g. "ללא עמלת תיווך" contains "תיווך" but means private/no-fee).
const PRIVATE_PHRASES = [
  "ללא תיווך", "לא תיווך", "בלי תיווך", "ללא עמלת תיווך", "לל\"ת", "ללת",
  "ישירות מבעל הדירה", "ישירות מהבעלים", "מבעל הדירה", "מהבעלים", "פרטי", "מפרטי",
  "no broker", "owner direct", "private listing", "no agent", "no fee",
];
const BROKER_PHRASES = [
  "משרד תיווך", "עמלת תיווך", "דמי תיווך", "מתיווך", "מתווכת", "מתווך", "תיווך",
  "brokerage fee", "broker", "agency", "agent",
];
const FEE_NONE_PHRASES = ["ללא עמלת תיווך", "ללא דמי תיווך", "no fee", "ללא עמלה"];
const FEE_EXISTS_PHRASES = ["עמלת תיווך", "דמי תיווך", "brokerage fee", "עמלה: "];

function findPhrase(text: string, phrases: string[]): string | null {
  const lower = text.toLowerCase();
  for (const p of phrases) {
    if (lower.includes(p.toLowerCase())) return p;
  }
  return null;
}

export function classifyBroker(text: string): {
  status: BrokerStatus;
  evidence: string | null;
  feeStatus: FeeStatus;
  feeText: string | null;
} {
  // Fee first (independent of status)
  let feeStatus: FeeStatus = "UNKNOWN";
  let feeText: string | null = null;
  const feeNone = findPhrase(text, FEE_NONE_PHRASES);
  if (feeNone) {
    feeStatus = "NONE";
    feeText = feeNone;
  } else {
    const feeExists = findPhrase(text, FEE_EXISTS_PHRASES);
    if (feeExists) {
      feeStatus = "EXISTS";
      feeText = feeExists;
    }
  }

  // Status: private/negation phrases win over broker phrases
  const privateHit = findPhrase(text, PRIVATE_PHRASES);
  if (privateHit) return { status: "PRIVATE", evidence: privateHit, feeStatus, feeText };
  const brokerHit = findPhrase(text, BROKER_PHRASES);
  if (brokerHit) {
    // A broker post implies a fee exists unless stated otherwise
    if (feeStatus === "UNKNOWN") feeStatus = "UNKNOWN"; // keep unknown; don't over-assume
    return { status: "BROKER", evidence: brokerHit, feeStatus, feeText: feeText ?? brokerHit };
  }
  return { status: "UNKNOWN", evidence: null, feeStatus, feeText };
}

export function extractYad2Id(url: string | null, text: string): string | null {
  const candidates = [url ?? "", text];
  for (const s of candidates) {
    // https://www.yad2.co.il/realestate/item/abc123xyz  |  ...item/12345678
    const m1 = s.match(/yad2\.co\.il\/[^\s]*item\/([A-Za-z0-9]+)/i);
    if (m1) return m1[1];
    const m2 = s.match(/[?&]id=([A-Za-z0-9]+)/i);
    if (m2 && s.toLowerCase().includes("yad2")) return m2[1];
  }
  return null;
}

function extractPrice(text: string): number | null {
  // ₪7,200 | 7,200 ₪ | 7200 ש"ח | NIS 7200 | מחיר: 7,200
  const patterns = [
    /₪\s?([\d,.]+)/,
    /([\d,.]{3,})\s?₪/,
    /([\d,.]{3,})\s?ש"?ח/,
    /nis\s?([\d,.]+)/i,
    /מחיר[:\s]+([\d,.]+)/,
    /price[:\s]+([\d,.]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/[,.]/g, ""), 10);
      if (!isNaN(n) && n >= 500) return n;
    }
  }
  return null;
}

function extractRooms(text: string): number | null {
  const patterns = [
    /(\d+(?:[.,]5)?)\s*חדרים/,
    /(\d+(?:[.,]5)?)\s*חד['׳]/,
    /דירת\s+(\d+(?:[.,]5)?)/,
    /(\d+(?:[.,]5)?)\s*rooms?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseFloat(m[1].replace(",", "."));
      if (n > 0 && n <= 12) return n;
    }
  }
  return null;
}

function extractSize(text: string): number | null {
  const patterns = [/(\d{2,3})\s*מ["״]?ר/, /(\d{2,3})\s*(?:sqm|m2|m²)/i];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 15 && n <= 1000) return n;
    }
  }
  return null;
}

function extractFloor(text: string): number | null {
  if (/ק["״]ק|קומת קרקע/.test(text)) return 0;
  const m = text.match(/קומה\s*(\d+)/) ?? text.match(/floor\s*(\d+)/i) ?? text.match(/(\d+)(?:st|nd|rd|th)\s+floor/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 0 && n <= 60) return n;
  }
  return null;
}

function extractBool(text: string, positives: string[], negatives: string[]): boolean | null {
  const lower = text.toLowerCase();
  for (const n of negatives) if (lower.includes(n.toLowerCase())) return false;
  for (const p of positives) if (lower.includes(p.toLowerCase())) return true;
  return null;
}

function extractDealType(text: string): "RENT" | "SALE" | null {
  const lower = text.toLowerCase();
  if (/להשכרה|השכרה|שכירות|for rent|monthly rent|לשכירות/.test(lower)) return "RENT";
  if (/למכירה|מכירה|for sale|נמכרת/.test(lower)) return "SALE";
  return null;
}

function extractCity(text: string): string | null {
  const lower = text.toLowerCase();
  for (const c of CITIES) {
    for (const alias of c.aliases) {
      if (lower.includes(alias.toLowerCase())) return c.canonical;
    }
  }
  return null;
}

function extractPropertyType(text: string): string | null {
  if (/פנטהאוז|penthouse/i.test(text)) return "PENTHOUSE";
  if (/דירת גן|garden apartment/i.test(text)) return "GARDEN_APT";
  if (/(בית פרטי|קוטג|וילה|house|villa|cottage)/i.test(text)) return "HOUSE";
  if (/דופלקס|duplex/i.test(text)) return "DUPLEX";
  if (/(דירה|apartment|apt)/i.test(text)) return "APARTMENT";
  return null;
}

export function parseListing(rawText: string, url: string | null = null): ParsedListing {
  const broker = classifyBroker(rawText);
  return {
    dealType: extractDealType(rawText),
    city: extractCity(rawText),
    neighborhood: null, // kept simple in MVP
    price: extractPrice(rawText),
    rooms: extractRooms(rawText),
    sizeSqm: extractSize(rawText),
    floor: extractFloor(rawText),
    balcony: extractBool(rawText, ["מרפסת", "balcony"], ["ללא מרפסת", "אין מרפסת", "no balcony"]),
    parking: extractBool(rawText, ["חניה", "חנייה", "parking"], ["ללא חניה", "אין חניה", "ללא חנייה", "אין חנייה", "no parking"]),
    elevator: extractBool(rawText, ["מעלית", "elevator", "lift"], ["ללא מעלית", "אין מעלית", "no elevator"]),
    mamad: extractBool(rawText, ['ממ"ד', "ממ״ד", "ממד", "חדר ביטחון", "safe room", "mamad"], ['ללא ממ"ד', "אין ממד", 'אין ממ"ד']),
    propertyType: extractPropertyType(rawText),
    entryImmediate: /מיידי|כניסה מיידית|immediate/i.test(rawText) ? true : null,
    brokerStatus: broker.status,
    brokerEvidence: broker.evidence,
    brokerFeeStatus: broker.feeStatus,
    brokerFeeText: broker.feeText,
    yad2ListingId: extractYad2Id(url, rawText),
  };
}

// Deterministic, explainable 0–100 scoring of a Listing against a Profile.
import type { Listing, Profile } from "@prisma/client";

export interface MatchResult {
  score: number;
  status: "strong_match" | "possible_match" | "weak_match" | "rejected";
  reasonsPositive: string[];
  reasonsNegative: string[];
  missingFields: string[];
  redFlags: string[];
  recommendedAction: string;
}

type FeaturePref = "REQUIRED" | "PREFERRED" | "INDIFFERENT";

function profileCities(profile: Profile): string[] {
  return profile.cities.split(",").map((c) => c.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Entry-date matching. Deliberately simple: only handles D.M / D/M / D.M.YY(YY)
// formats (already extracted by the parser); no timezone/locale complexity.
// A missing year assumes the current year — if that reads as already-past,
// the comparison below only ever treats it as "compatible" (never penalized),
// which is the safe direction for an ambiguous date.
// ---------------------------------------------------------------------------
function parseEntryDateApprox(raw: string | null): Date | null {
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

interface EntryDateEval {
  scoreDelta: number;
  pos?: string;
  neg?: string;
  missing?: string;
  capAtPossible?: boolean;
}

function evaluateEntryDate(profile: Profile, listing: Listing): EntryDateEval {
  if (!profile.entryBy) return { scoreDelta: 0 }; // profile doesn't care about entry timing
  const entryBy = new Date(profile.entryBy);
  if (isNaN(entryBy.getTime())) return { scoreDelta: 0 };

  if (listing.entryImmediate || listing.entryFlexible) {
    return { scoreDelta: 5, pos: "תאריך כניסה מתאים (מיידי/גמיש)" };
  }
  const listingDate = parseEntryDateApprox(listing.entryDate);
  if (!listingDate) {
    return { scoreDelta: 0, missing: "תאריך כניסה" };
  }
  const diffDays = (listingDate.getTime() - entryBy.getTime()) / 86_400_000;
  if (diffDays <= 14) {
    return { scoreDelta: 5, pos: "תאריך כניסה מתאים" };
  }
  return {
    scoreDelta: -6,
    neg: `תאריך הכניסה אולי מאוחר מדי (פינוי ${listing.entryDate}, אתה צריך עד ${profile.entryBy})`,
    capAtPossible: diffDays > 60, // clearly too late — never a strong match
  };
}

// ---------------------------------------------------------------------------
// Recommended-action phrasing: turn a raw missing-field label into a short
// actionable question.
// ---------------------------------------------------------------------------
const MISSING_FIELD_QUESTIONS: Record<string, string> = {
  "מרפסת": "לוודא שיש מרפסת (לא צוינה במפורש)",
  "חניה": "לשאול אם יש חניה",
  "מעלית": "לשאול אם יש מעלית",
  'ממ"ד': 'לשאול על ממ"ד',
  "סטטוס תיווך": "לשאול אם יש עמלת תיווך",
  "תאריך כניסה": "לשאול על תאריך הכניסה",
  "מחיר": "לשאול מה המחיר המדויק",
  "חדרים": "לוודא מספר חדרים",
  "עיר/מיקום": "לוודא כתובת/אזור מדויקים",
  'גודל (מ"ר)': "לוודא גודל מדויק",
};

function friendlyAsk(field: string): string {
  return MISSING_FIELD_QUESTIONS[field] ?? `לברר לגבי ${field}`;
}

const DEAL_WORD: Record<string, string> = { RENT: "השכרה", SALE: "מכירה" };

export function scoreListing(profile: Profile, listing: Listing): MatchResult {
  const pos: string[] = [];
  const neg: string[] = [];
  const missing: string[] = [];
  const flags: string[] = [];

  const reject = (reason: string): MatchResult => ({
    score: 0,
    status: "rejected",
    reasonsPositive: pos,
    reasonsNegative: [...neg, reason],
    missingFields: missing,
    redFlags: flags,
    recommendedAction: `כנראה לא רלוונטי: ${reason}`,
  });

  // ---------- HARD REJECTS (only on clearly-known deal-breakers; unknown never auto-rejects) ----------
  // Not-a-listing guard: a post with NO extractable apartment signal at all
  // (no city, price, rooms, or size) isn't usable — this is most Facebook group
  // chatter (discussions, questions). Reject so it doesn't clutter as a "possible".
  if (listing.city == null && listing.price == null && listing.rooms == null && listing.sizeSqm == null) {
    return reject("לא נמצאו פרטי דירה בפוסט (כנראה לא מודעה)");
  }
  if (listing.dealType && listing.dealType !== profile.dealType) {
    return reject(
      `סוג עסקה לא מתאים (המודעה ל${DEAL_WORD[listing.dealType] ?? listing.dealType}, הפרופיל מחפש ${DEAL_WORD[profile.dealType] ?? profile.dealType})`
    );
  }
  if (listing.price != null && listing.price > profile.priceMax * 1.05) {
    return reject(`מחיר ${listing.price.toLocaleString()} ₪ מעל התקציב המקסימלי ${profile.priceMax.toLocaleString()} ₪ (ביותר מ־5%)`);
  }
  // Known price clearly below the minimum (with 5% tolerance) — a set price range
  // is a hard filter, symmetric to the max above. (priceMin null = no minimum.)
  if (profile.priceMin != null && listing.price != null && listing.price < profile.priceMin * 0.95) {
    return reject(`מחיר ${listing.price.toLocaleString()} ₪ מתחת למינימום שהגדרת (${profile.priceMin.toLocaleString()} ₪)`);
  }
  const cities = profileCities(profile);
  if (listing.city && cities.length > 0 && !cities.includes(listing.city)) {
    return reject(`העיר ${listing.city} לא ברשימת הערים שלך (${cities.join(", ")})`);
  }
  // Known room count clearly outside the target range (beyond a ±0.5 tolerance)
  // is a hard filter — a 3-room won't alert when you asked for 4–5. A room count
  // within 0.5 of the range (e.g. 3.5 for a 4–5 search) still scores, penalized.
  if (listing.rooms != null && (profile.roomsMin != null || profile.roomsMax != null)) {
    const rMin = profile.roomsMin ?? 0;
    const rMax = profile.roomsMax ?? 99;
    if (listing.rooms < rMin - 0.5 || listing.rooms > rMax + 0.5) {
      return reject(`${listing.rooms} חדרים מחוץ לטווח שהגדרת (${rMin}–${rMax})`);
    }
  }
  // Brokerage hard rules
  if (profile.brokerStatusPref === "private_only" && listing.brokerStatus === "BROKER") {
    return reject(`מודעת תיווך אבל הפרופיל ללא־תיווך בלבד (סימן: ״${listing.brokerEvidence}״)`);
  }
  if (profile.brokerStatusPref === "broker_only" && listing.brokerStatus === "PRIVATE") {
    return reject(`מודעה פרטית אבל הפרופיל תיווך בלבד (סימן: ״${listing.brokerEvidence}״)`);
  }
  if (profile.brokerFeePref === "no_fee_only" && listing.brokerFeeStatus === "EXISTS") {
    return reject(`יש עמלת תיווך אבל הפרופיל דורש ללא עמלה (״${listing.brokerFeeText}״)`);
  }
  // Required features that are KNOWN absent
  const featurePrefs: { key: "balcony" | "parking" | "elevator" | "mamad"; pref: FeaturePref; label: string }[] = [
    { key: "balcony", pref: profile.balcony as FeaturePref, label: "מרפסת" },
    { key: "parking", pref: profile.parking as FeaturePref, label: "חניה" },
    { key: "elevator", pref: profile.elevator as FeaturePref, label: "מעלית" },
    { key: "mamad", pref: profile.mamad as FeaturePref, label: 'ממ"ד' },
  ];
  for (const f of featurePrefs) {
    if (f.pref === "REQUIRED" && listing[f.key] === false) {
      return reject(`${f.label} — חובה בפרופיל אבל צוין במפורש שאין`);
    }
  }

  // ---------- WEIGHTED SCORING (price 25, location 20, rooms 15, size 10, features 20, broker 10) ----------
  let score = 0;
  let capAtPossible = false;

  // Price (25)
  if (listing.price == null) {
    score += 12;
    missing.push("מחיר");
  } else if (listing.price <= profile.priceMax) {
    score += 25;
    pos.push(`מחיר ${listing.price.toLocaleString()} ₪ בתקציב (עד ${profile.priceMax.toLocaleString()} ₪)`);
  } else {
    // within the 5% tolerance band: possible at best, never strong
    score += 10;
    neg.push(`מחיר ${listing.price.toLocaleString()} ₪ מעט מעל התקציב (בתחום 5%)`);
    capAtPossible = true;
  }

  // Location (20)
  if (listing.city == null) {
    score += 8;
    missing.push("עיר/מיקום");
    capAtPossible = true; // unverified location can't be a strong match
  } else {
    score += 20;
    pos.push(`עיר מבוקשת: ${listing.city}`);
  }

  // Rooms (15)
  if (listing.rooms == null) {
    score += 7;
    missing.push("חדרים");
  } else {
    const min = profile.roomsMin ?? 0;
    const max = profile.roomsMax ?? 99;
    if (listing.rooms >= min && listing.rooms <= max) {
      score += 15;
      pos.push(`${listing.rooms} חדרים — בדיוק בטווח`);
    } else if (listing.rooms >= min - 0.5 && listing.rooms <= max + 0.5) {
      score += 8;
      neg.push(`${listing.rooms} חדרים מעט מחוץ לטווח ${min}–${max}`);
    } else {
      neg.push(`${listing.rooms} חדרים רחוק מהטווח ${min}–${max}`);
    }
  }

  // Size (10)
  if (listing.sizeSqm == null) {
    score += 5;
    if (profile.sizeMinSqm) missing.push('גודל (מ"ר)');
  } else if (!profile.sizeMinSqm || listing.sizeSqm >= profile.sizeMinSqm) {
    score += 10;
    if (profile.sizeMinSqm) pos.push(`${listing.sizeSqm} מ"ר — מעל המינימום (${profile.sizeMinSqm})`);
    else pos.push(`${listing.sizeSqm} מ"ר`);
  } else if (listing.sizeSqm >= profile.sizeMinSqm * 0.9) {
    score += 6;
    neg.push(`${listing.sizeSqm} מ"ר מעט מתחת למינימום ${profile.sizeMinSqm}`);
  } else {
    score += 2;
    neg.push(`${listing.sizeSqm} מ"ר הרבה מתחת למינימום ${profile.sizeMinSqm}`);
  }

  // Features (20 → 5 each)
  for (const f of featurePrefs) {
    const v = listing[f.key];
    if (f.pref === "INDIFFERENT") {
      score += 5; // neutral: don't punish for irrelevant features
    } else if (v === true) {
      score += 5;
      pos.push(`יש ${f.label}`);
    } else if (v === null) {
      score += f.pref === "REQUIRED" ? 2 : 3;
      missing.push(f.label);
      if (f.pref === "REQUIRED") capAtPossible = true; // required feature unverified → possible at best
    } else {
      // known absent, PREFERRED (REQUIRED-absent already rejected)
      score += 1;
      neg.push(`אין ${f.label}`);
    }
  }

  // Brokerage (10)
  const bs = listing.brokerStatus;
  switch (profile.brokerStatusPref) {
    case "any":
    case "unknown_allowed":
      score += 10;
      break;
    case "private_only":
      if (bs === "PRIVATE") {
        score += 10;
        pos.push(`ללא תיווך (סימן: ״${listing.brokerEvidence}״)`);
      } else {
        // UNKNOWN (BROKER already rejected)
        score += 4;
        missing.push("סטטוס תיווך");
        capAtPossible = true;
      }
      break;
    case "broker_only":
      if (bs === "BROKER") {
        score += 10;
        pos.push(`מתיווך (סימן: ״${listing.brokerEvidence}״)`);
      } else {
        score += 4;
        missing.push("סטטוס תיווך");
      }
      break;
    case "private_preferred_broker_allowed_if_strong_match":
      if (bs === "PRIVATE") {
        score += 10;
        pos.push(`ללא תיווך (סימן: ״${listing.brokerEvidence}״)`);
      } else if (bs === "UNKNOWN") {
        score += 6;
        missing.push("סטטוס תיווך");
      } else {
        score += 3; // penalty, not reject
        neg.push(`מתיווך — מותר רק כי שאר ההתאמה חזקה (סימן: ״${listing.brokerEvidence}״)`);
      }
      break;
  }
  // Fee preference soft handling
  if (profile.brokerFeePref === "max_fee_if_known" && listing.brokerFeeStatus === "EXISTS" && profile.maxFeeIfKnown) {
    neg.push(`יש עמלת תיווך (״${listing.brokerFeeText}״) — לוודא שהיא עד ${profile.maxFeeIfKnown.toLocaleString()} ₪`);
    score -= 3;
  }

  // Entry-date matching (soft bonus/penalty — does not disturb the base-100 pool above)
  const entryEval = evaluateEntryDate(profile, listing);
  score += entryEval.scoreDelta;
  if (entryEval.pos) pos.push(entryEval.pos);
  if (entryEval.neg) neg.push(entryEval.neg);
  if (entryEval.missing) missing.push(entryEval.missing);
  if (entryEval.capAtPossible) capAtPossible = true;

  // ---------- RED FLAGS ----------
  if (listing.price != null && listing.price < profile.priceMax * 0.45) {
    flags.push("מחיר חשוד בזול לחיפוש הזה — לוודא שלא מדובר בפיתיון/הונאה");
    score -= 8;
    capAtPossible = true; // a likely scam must never fire a "call immediately" strong alert
  }
  if (listing.price == null) flags.push("לא צוין מחיר");
  if (listing.city == null) flags.push("אין מיקום ברור");
  if (listing.isDuplicateOf) {
    flags.push("ייתכן שזו כפילות של מודעה קיימת");
    capAtPossible = true;
  }
  if (missing.length >= 5) {
    flags.push("חסר יותר מדי מידע");
    capAtPossible = true;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  // ---------- STATUS ----------
  let status: MatchResult["status"];
  if (score >= 80) status = "strong_match";
  else if (score >= 60) status = "possible_match";
  else if (score >= 40) status = "weak_match";
  else status = "rejected";
  if (capAtPossible && status === "strong_match") {
    status = "possible_match";
    score = Math.min(score, 79);
  }

  // ---------- RECOMMENDED ACTION ----------
  let action: string;
  if (listing.isDuplicateOf) {
    action = "נראה ככפילות/פרסום חוזר — בדוק קודם את המודעה המקורית";
  } else if (status === "strong_match") {
    action = missing.length > 0 ? `התקשר עכשיו — ${missing.slice(0, 2).map(friendlyAsk).join(", ")}` : "התקשר עכשיו";
  } else if (status === "possible_match") {
    if (missing.length >= 3) {
      action = `התאמה טובה אבל חסרים פרטים מרכזיים — ${missing.slice(0, 3).map(friendlyAsk).join(", ")}`;
    } else if (missing.length > 0) {
      action = `פוטנציאל טוב — ${missing.map(friendlyAsk).join(", ")}`;
    } else {
      action = "שווה בדיקה — עבור על הפרטים";
    }
  } else if (status === "weak_match") {
    action = `כנראה לא רלוונטי: ${neg[0] ?? "כמה קריטריונים לא התקיימו"}`;
  } else {
    action = `כנראה לא רלוונטי: ${neg[0] ?? "הקריטריונים לא התקיימו"}`;
  }

  return {
    score,
    status,
    reasonsPositive: pos,
    reasonsNegative: neg,
    missingFields: missing,
    redFlags: flags,
    recommendedAction: action,
  };
}

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
    return { scoreDelta: 5, pos: "Entry date looks compatible (immediate/flexible)" };
  }
  const listingDate = parseEntryDateApprox(listing.entryDate);
  if (!listingDate) {
    return { scoreDelta: 0, missing: "entry date" };
  }
  const diffDays = (listingDate.getTime() - entryBy.getTime()) / 86_400_000;
  if (diffDays <= 14) {
    return { scoreDelta: 5, pos: "Entry date looks compatible" };
  }
  return {
    scoreDelta: -6,
    neg: `Entry date may be too late (listing available ${listing.entryDate}, you need by ${profile.entryBy})`,
    capAtPossible: diffDays > 60, // clearly too late — never a strong match
  };
}

// ---------------------------------------------------------------------------
// Recommended-action phrasing: turn a raw missing-field label into a short
// actionable question.
// ---------------------------------------------------------------------------
const MISSING_FIELD_QUESTIONS: Record<string, string> = {
  balcony: "verify balcony (not clearly mentioned)",
  parking: "ask if parking is available/registered",
  elevator: "ask if there's an elevator",
  "mamad (safe room)": "ask about the mamad (safe room)",
  "broker status unknown": "ask if a broker fee applies",
  "entry date": "ask about the entry date",
  price: "ask for the exact price",
  rooms: "confirm exact room count",
  "city/location": "confirm the exact address/area",
  "size (sqm)": "confirm the exact size",
};

function friendlyAsk(field: string): string {
  return MISSING_FIELD_QUESTIONS[field] ?? `ask about ${field}`;
}

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
    recommendedAction: `Probably irrelevant: ${reason}`,
  });

  // ---------- HARD REJECTS (only on clearly-known deal-breakers; unknown never auto-rejects) ----------
  // Not-a-listing guard: a post with NO extractable apartment signal at all
  // (no city, price, rooms, or size) isn't usable — this is most Facebook group
  // chatter (discussions, questions). Reject so it doesn't clutter as a "possible".
  if (listing.city == null && listing.price == null && listing.rooms == null && listing.sizeSqm == null) {
    return reject("no apartment details found (likely not a listing)");
  }
  if (listing.dealType && listing.dealType !== profile.dealType) {
    return reject(`deal type mismatch (listing is ${listing.dealType}, profile wants ${profile.dealType})`);
  }
  if (listing.price != null && listing.price > profile.priceMax * 1.05) {
    return reject(`price ₪${listing.price.toLocaleString()} exceeds max ₪${profile.priceMax.toLocaleString()} by more than 5%`);
  }
  // Known price clearly below the minimum (with 5% tolerance) — a set price range
  // is a hard filter, symmetric to the max above. (priceMin null = no minimum.)
  if (profile.priceMin != null && listing.price != null && listing.price < profile.priceMin * 0.95) {
    return reject(`price ₪${listing.price.toLocaleString()} below minimum ₪${profile.priceMin.toLocaleString()}`);
  }
  const cities = profileCities(profile);
  if (listing.city && cities.length > 0 && !cities.includes(listing.city)) {
    return reject(`city ${listing.city} not in target cities (${cities.join(", ")})`);
  }
  // Known room count clearly outside the target range (beyond a ±0.5 tolerance)
  // is a hard filter — a 3-room won't alert when you asked for 4–5. A room count
  // within 0.5 of the range (e.g. 3.5 for a 4–5 search) still scores, penalized.
  if (listing.rooms != null && (profile.roomsMin != null || profile.roomsMax != null)) {
    const rMin = profile.roomsMin ?? 0;
    const rMax = profile.roomsMax ?? 99;
    if (listing.rooms < rMin - 0.5 || listing.rooms > rMax + 0.5) {
      return reject(`${listing.rooms} rooms outside target ${rMin}–${rMax}`);
    }
  }
  // Brokerage hard rules
  if (profile.brokerStatusPref === "private_only" && listing.brokerStatus === "BROKER") {
    return reject(`broker listing but profile is private-only (evidence: "${listing.brokerEvidence}")`);
  }
  if (profile.brokerStatusPref === "broker_only" && listing.brokerStatus === "PRIVATE") {
    return reject(`private listing but profile is broker-only (evidence: "${listing.brokerEvidence}")`);
  }
  if (profile.brokerFeePref === "no_fee_only" && listing.brokerFeeStatus === "EXISTS") {
    return reject(`broker fee exists but profile requires no fee ("${listing.brokerFeeText}")`);
  }
  // Required features that are KNOWN absent
  const featurePrefs: { key: "balcony" | "parking" | "elevator" | "mamad"; pref: FeaturePref; label: string }[] = [
    { key: "balcony", pref: profile.balcony as FeaturePref, label: "balcony" },
    { key: "parking", pref: profile.parking as FeaturePref, label: "parking" },
    { key: "elevator", pref: profile.elevator as FeaturePref, label: "elevator" },
    { key: "mamad", pref: profile.mamad as FeaturePref, label: "mamad (safe room)" },
  ];
  for (const f of featurePrefs) {
    if (f.pref === "REQUIRED" && listing[f.key] === false) {
      return reject(`required ${f.label} is explicitly absent`);
    }
  }

  // ---------- WEIGHTED SCORING (price 25, location 20, rooms 15, size 10, features 20, broker 10) ----------
  let score = 0;
  let capAtPossible = false;

  // Price (25)
  if (listing.price == null) {
    score += 12;
    missing.push("price");
  } else if (listing.price <= profile.priceMax) {
    score += 25;
    pos.push(`price ₪${listing.price.toLocaleString()} within budget (max ₪${profile.priceMax.toLocaleString()})`);
  } else {
    // within the 5% tolerance band: possible at best, never strong
    score += 10;
    neg.push(`price ₪${listing.price.toLocaleString()} slightly over budget (within 5% tolerance)`);
    capAtPossible = true;
  }

  // Location (20)
  if (listing.city == null) {
    score += 8;
    missing.push("city/location");
    capAtPossible = true; // unverified location can't be a strong match
  } else {
    score += 20;
    pos.push(`target city: ${listing.city}`);
  }

  // Rooms (15)
  if (listing.rooms == null) {
    score += 7;
    missing.push("rooms");
  } else {
    const min = profile.roomsMin ?? 0;
    const max = profile.roomsMax ?? 99;
    if (listing.rooms >= min && listing.rooms <= max) {
      score += 15;
      pos.push(`${listing.rooms} rooms fits target`);
    } else if (listing.rooms >= min - 0.5 && listing.rooms <= max + 0.5) {
      score += 8;
      neg.push(`${listing.rooms} rooms slightly outside target ${min}–${max}`);
    } else {
      neg.push(`${listing.rooms} rooms far from target ${min}–${max}`);
    }
  }

  // Size (10)
  if (listing.sizeSqm == null) {
    score += 5;
    if (profile.sizeMinSqm) missing.push("size (sqm)");
  } else if (!profile.sizeMinSqm || listing.sizeSqm >= profile.sizeMinSqm) {
    score += 10;
    if (profile.sizeMinSqm) pos.push(`${listing.sizeSqm} sqm meets minimum ${profile.sizeMinSqm}`);
    else pos.push(`${listing.sizeSqm} sqm`);
  } else if (listing.sizeSqm >= profile.sizeMinSqm * 0.9) {
    score += 6;
    neg.push(`${listing.sizeSqm} sqm slightly under minimum ${profile.sizeMinSqm}`);
  } else {
    score += 2;
    neg.push(`${listing.sizeSqm} sqm well under minimum ${profile.sizeMinSqm}`);
  }

  // Features (20 → 5 each)
  for (const f of featurePrefs) {
    const v = listing[f.key];
    if (f.pref === "INDIFFERENT") {
      score += 5; // neutral: don't punish for irrelevant features
    } else if (v === true) {
      score += 5;
      pos.push(`has ${f.label}`);
    } else if (v === null) {
      score += f.pref === "REQUIRED" ? 2 : 3;
      missing.push(f.label);
      if (f.pref === "REQUIRED") capAtPossible = true; // required feature unverified → possible at best
    } else {
      // known absent, PREFERRED (REQUIRED-absent already rejected)
      score += 1;
      neg.push(`no ${f.label}`);
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
        pos.push(`private listing (evidence: "${listing.brokerEvidence}")`);
      } else {
        // UNKNOWN (BROKER already rejected)
        score += 4;
        missing.push("broker status unknown");
        capAtPossible = true;
      }
      break;
    case "broker_only":
      if (bs === "BROKER") {
        score += 10;
        pos.push(`broker listing (evidence: "${listing.brokerEvidence}")`);
      } else {
        score += 4;
        missing.push("broker status unknown");
      }
      break;
    case "private_preferred_broker_allowed_if_strong_match":
      if (bs === "PRIVATE") {
        score += 10;
        pos.push(`private listing (evidence: "${listing.brokerEvidence}")`);
      } else if (bs === "UNKNOWN") {
        score += 6;
        missing.push("broker status unknown");
      } else {
        score += 3; // penalty, not reject
        neg.push(`broker listing — allowed only because match is otherwise strong (evidence: "${listing.brokerEvidence}")`);
      }
      break;
  }
  // Fee preference soft handling
  if (profile.brokerFeePref === "max_fee_if_known" && listing.brokerFeeStatus === "EXISTS" && profile.maxFeeIfKnown) {
    neg.push(`broker fee exists ("${listing.brokerFeeText}") — verify it is under ₪${profile.maxFeeIfKnown.toLocaleString()}`);
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
    flags.push("price suspiciously low for this search — verify it's not bait/scam");
    score -= 8;
    capAtPossible = true; // a likely scam must never fire a "call immediately" strong alert
  }
  if (listing.price == null) flags.push("no price stated");
  if (listing.city == null) flags.push("no clear location");
  if (listing.isDuplicateOf) {
    flags.push("possible duplicate of an existing listing");
    capAtPossible = true;
  }
  if (missing.length >= 5) {
    flags.push("too much missing information");
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
    action = "Looks like a duplicate/repost — check the original listing first";
  } else if (status === "strong_match") {
    action = missing.length > 0 ? `Call immediately — ${missing.slice(0, 2).map(friendlyAsk).join(", ")}` : "Call immediately";
  } else if (status === "possible_match") {
    if (missing.length >= 3) {
      action = `Good fit but missing key details — ${missing.slice(0, 3).map(friendlyAsk).join(", ")}`;
    } else if (missing.length > 0) {
      action = `Good potential fit — ${missing.map(friendlyAsk).join(", ")}`;
    } else {
      action = "Worth a look — review details";
    }
  } else if (status === "weak_match") {
    action = `Probably irrelevant: ${neg[0] ?? "several criteria missed"}`;
  } else {
    action = `Probably irrelevant: ${neg[0] ?? "criteria not met"}`;
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

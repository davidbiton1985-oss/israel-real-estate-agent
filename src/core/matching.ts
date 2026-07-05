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
  if (listing.dealType && listing.dealType !== profile.dealType) {
    return reject(`deal type mismatch (listing is ${listing.dealType}, profile wants ${profile.dealType})`);
  }
  if (listing.price != null && listing.price > profile.priceMax * 1.05) {
    return reject(`price ₪${listing.price.toLocaleString()} exceeds max ₪${profile.priceMax.toLocaleString()} by more than 5%`);
  }
  const cities = profileCities(profile);
  if (listing.city && cities.length > 0 && !cities.includes(listing.city)) {
    return reject(`city ${listing.city} not in target cities (${cities.join(", ")})`);
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
    score += 10; // within the 5% tolerance band
    neg.push(`price ₪${listing.price.toLocaleString()} slightly over budget (within 5% tolerance)`);
  }

  // Location (20)
  if (listing.city == null) {
    score += 8;
    missing.push("city/location");
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

  // ---------- RED FLAGS ----------
  if (listing.price != null && listing.price < profile.priceMax * 0.45) {
    flags.push("price suspiciously low for this search — verify it's not bait/scam");
    score -= 8;
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
    action = "Looks duplicated — check the original listing first";
  } else if (status === "strong_match") {
    action = missing.length > 0 ? `Call immediately and ask about: ${missing.slice(0, 3).join(", ")}` : "Call immediately";
  } else if (status === "possible_match") {
    action = missing.length > 0 ? `Good potential fit but verify: ${missing.slice(0, 3).join(", ")}` : "Worth a look — review details";
  } else if (status === "weak_match") {
    action = `Probably not a fit: ${neg[0] ?? "several criteria missed"}`;
  } else {
    action = `Not a fit: ${neg[0] ?? "criteria not met"}`;
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

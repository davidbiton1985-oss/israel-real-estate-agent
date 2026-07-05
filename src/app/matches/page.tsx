import { prisma } from "@/lib/db";
import { saveListingNotes } from "@/app/actions";
import type { Listing } from "@prisma/client";

export const dynamic = "force-dynamic";

function fmtDebug(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v === true) return "true";
  if (v === false) return "false";
  return String(v);
}

/** Plain-text dump of every parsed field, for real-world QA. Not styled — debug only. */
function debugFieldsText(l: Listing): string {
  const dedupType = l.fingerprint.split(":")[0]; // "yad2" | "url" | "content"
  const lines = [
    `source=${l.source}  url=${l.url ?? "—"}`,
    `yad2ListingId=${fmtDebug(l.yad2ListingId)}`,
    `fingerprint=${l.fingerprint}  (dedup key type: ${dedupType})`,
    `isDuplicateOf=${fmtDebug(l.isDuplicateOf)}${l.isDuplicateOf ? " (fuzzy text match — see docs/browser-helper.md / README)" : ""}`,
    ``,
    `dealType=${fmtDebug(l.dealType)}  propertyType=${fmtDebug(l.propertyType)}`,
    `city=${fmtDebug(l.city)}  neighborhood=${fmtDebug(l.neighborhood)}  street=${fmtDebug(l.street)}`,
    `price=${fmtDebug(l.price)}  rooms=${fmtDebug(l.rooms)}  sqm=${fmtDebug(l.sizeSqm)}`,
    `floor=${fmtDebug(l.floor)}  totalFloors=${fmtDebug(l.totalFloors)}`,
    `condition=${fmtDebug(l.condition)}  furnished=${fmtDebug(l.furnished)}`,
    ``,
    `balcony=${fmtDebug(l.balcony)}  parking=${fmtDebug(l.parking)}  elevator=${fmtDebug(l.elevator)}  mamad=${fmtDebug(l.mamad)}`,
    `storage=${fmtDebug(l.storage)}  garden=${fmtDebug(l.garden)}`,
    ``,
    `entryImmediate=${fmtDebug(l.entryImmediate)}  entryFlexible=${fmtDebug(l.entryFlexible)}  entryDate=${fmtDebug(l.entryDate)}`,
    `arnonaMonthly=${fmtDebug(l.arnonaMonthly)}  vaadMonthly=${fmtDebug(l.vaadMonthly)}`,
    ``,
    `brokerStatus=${fmtDebug(l.brokerStatus)}  brokerConfidence=${fmtDebug(l.brokerConfidence)}`,
    `brokerEvidence=${fmtDebug(l.brokerEvidence)}`,
    `brokerFeeStatus=${fmtDebug(l.brokerFeeStatus)}  brokerFeeText=${fmtDebug(l.brokerFeeText)}`,
  ];
  return lines.join("\n");
}

const STATUS_STYLES: Record<string, string> = {
  strong_match: "bg-green-100 text-green-800 border-green-300",
  possible_match: "bg-yellow-100 text-yellow-800 border-yellow-300",
  weak_match: "bg-slate-100 text-slate-600 border-slate-300",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const RECOMMENDED_ACTION_STYLES: Record<string, string> = {
  strong_match: "bg-green-50 text-green-900 border-green-200",
  possible_match: "bg-amber-50 text-amber-900 border-amber-200",
  weak_match: "bg-slate-50 text-slate-600 border-slate-200",
  rejected: "bg-slate-50 text-slate-500 border-slate-200",
};

function parseArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function parsePriceHistory(s: string): { amount: number; seenAt: string }[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const OUTCOME_MESSAGES: Record<string, string> = {
  new: "✓ New listing added.",
  price_drop: "📉 Price drop detected on an existing listing — alert queued/sent.",
  material_change: "🔄 Listing details changed since the last alert — alert queued/sent.",
  suppressed: "Existing listing updated — no new alert (nothing alert-worthy changed since last time). Duplicate/repeat suppressed.",
  updated: "Existing listing updated (re-parsed and re-scored).",
};

const ALERT_STATUS_STYLES: Record<string, string> = {
  SENT: "bg-green-100 text-green-800",
  SENDING: "bg-blue-100 text-blue-800",
  QUEUED: "bg-blue-100 text-blue-800",
  FAILED: "bg-red-100 text-red-800",
  SUPPRESSED: "bg-slate-200 text-slate-600",
};

interface MatchesSearchParams {
  scanned?: string;
  alertsSent?: string;
  outcome?: string;
  profile?: string;
  status?: string;
  source?: string;
  broker?: string;
  alertReason?: string;
  hasRedFlags?: string;
  minScore?: string;
}

export default async function MatchesPage({ searchParams }: { searchParams: MatchesSearchParams }) {
  const [allMatches, profiles] = await Promise.all([
    prisma.match.findMany({
      include: { profile: true, listing: true, alerts: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { score: "desc" },
    }),
    prisma.profile.findMany({ orderBy: { name: "asc" } }),
  ]);

  const minScore = searchParams.minScore ? Number(searchParams.minScore) : null;
  const matches = allMatches.filter((m) => {
    if (searchParams.profile && m.profileId !== searchParams.profile) return false;
    if (searchParams.status && m.status !== searchParams.status) return false;
    if (searchParams.source && m.listing.source !== searchParams.source) return false;
    if (searchParams.broker && m.listing.brokerStatus !== searchParams.broker) return false;
    if (searchParams.alertReason && m.alerts[0]?.reason !== searchParams.alertReason) return false;
    if (searchParams.hasRedFlags === "1" && parseArr(m.redFlags).length === 0) return false;
    if (minScore != null && !isNaN(minScore) && m.score < minScore) return false;
    return true;
  });

  const selectCls = "border border-slate-300 rounded px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Matches</h1>
      {searchParams.scanned && (
        <div className="bg-blue-100 border border-blue-300 rounded p-3 text-sm">
          Scan complete — processed {searchParams.scanned} pending listing(s), {searchParams.alertsSent ?? 0} alert(s) sent.
        </div>
      )}
      {searchParams.outcome && (
        <div className="bg-blue-100 border border-blue-300 rounded p-3 text-sm">
          {OUTCOME_MESSAGES[searchParams.outcome] ?? "Listing processed."}
        </div>
      )}

      <form method="GET" className="bg-white rounded shadow p-3 flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Profile</span>
          <select name="profile" defaultValue={searchParams.profile ?? ""} className={selectCls}>
            <option value="">All</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Status</span>
          <select name="status" defaultValue={searchParams.status ?? ""} className={selectCls}>
            <option value="">All</option>
            <option value="strong_match">Strong</option>
            <option value="possible_match">Possible</option>
            <option value="weak_match">Weak</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Source</span>
          <select name="source" defaultValue={searchParams.source ?? ""} className={selectCls}>
            <option value="">All</option>
            <option value="YAD2">Yad2</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="MANUAL">Manual</option>
            <option value="URL">URL</option>
            <option value="DEMO">Demo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Broker</span>
          <select name="broker" defaultValue={searchParams.broker ?? ""} className={selectCls}>
            <option value="">All</option>
            <option value="PRIVATE">Private</option>
            <option value="BROKER">Broker</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Alert type</span>
          <select name="alertReason" defaultValue={searchParams.alertReason ?? ""} className={selectCls}>
            <option value="">All</option>
            <option value="NEW_MATCH">New match</option>
            <option value="PRICE_DROP">Price drop</option>
            <option value="MATERIAL_CHANGE">Material change</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-500">Min score</span>
          <input name="minScore" type="number" min={0} max={100} defaultValue={searchParams.minScore ?? ""} className={selectCls + " w-20"} />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" name="hasRedFlags" value="1" defaultChecked={searchParams.hasRedFlags === "1"} />
          <span className="text-xs text-slate-500">🚩 Has red flags</span>
        </label>
        <button type="submit" className="bg-slate-700 text-white px-3 py-1.5 rounded text-sm">Filter</button>
        <a href="/matches" className="text-xs text-blue-600 hover:underline">Clear</a>
        <span className="text-xs text-slate-400 ml-auto">{matches.length} of {allMatches.length} shown</span>
      </form>

      {matches.length === 0 && (
        <p className="text-slate-500">No matches match these filters. Try clearing filters, adding a listing, or running a scan.</p>
      )}
      <div className="space-y-4">
        {matches.map((m) => {
          const pos = parseArr(m.reasonsPositive);
          const neg = parseArr(m.reasonsNegative);
          const missing = parseArr(m.missingFields);
          const flags = parseArr(m.redFlags);
          const l = m.listing;
          const priceHistory = parsePriceHistory(l.priceHistory);
          const latestAlert = m.alerts[0];
          return (
            <div key={m.id} className={`rounded border shadow-sm p-4 bg-white`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-2xl font-bold">{m.score}/100</span>
                    <span className={`text-xs px-2 py-1 rounded border ${STATUS_STYLES[m.status] ?? ""}`}>{m.status}</span>
                    <span className="text-xs px-2 py-1 rounded bg-slate-100">{l.source}</span>
                    {l.isDuplicateOf && <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-800">duplicate</span>}
                    {l.qaNotes && <span className="text-xs px-2 py-1 rounded bg-pink-100 text-pink-800">📝 has QA notes</span>}
                    {latestAlert && (
                      <span className={`text-xs px-2 py-1 rounded ${ALERT_STATUS_STYLES[latestAlert.status] ?? "bg-slate-100"}`}>
                        {latestAlert.status} via {latestAlert.channel}
                        {latestAlert.reason ? ` (${latestAlert.reason})` : ""}
                      </span>
                    )}
                  </div>
                  {latestAlert && (latestAlert.sentAt || latestAlert.error) && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      {latestAlert.sentAt && <>Sent {new Date(latestAlert.sentAt).toLocaleString()}</>}
                      {latestAlert.error && <span className="text-amber-700"> · {latestAlert.error}</span>}
                    </div>
                  )}
                  <div className="text-sm text-slate-600 mt-1">
                    Profile: <b>{m.profile.name}</b>
                  </div>
                  <div className="text-sm mt-1">
                    {l.dealType === "SALE" ? "Sale" : l.dealType === "RENT" ? "Rental" : "Type unknown"} ·{" "}
                    {l.city ?? "city?"} · {l.price != null ? `₪${l.price.toLocaleString()}` : "price?"} ·{" "}
                    {l.rooms != null ? `${l.rooms} rooms` : "rooms?"} · {l.sizeSqm != null ? `${l.sizeSqm} sqm` : "sqm?"}
                  </div>
                  <div className="text-sm mt-1">
                    Broker:{" "}
                    <b className={l.brokerStatus === "PRIVATE" ? "text-green-700" : l.brokerStatus === "BROKER" ? "text-purple-700" : "text-slate-500"}>
                      {l.brokerStatus === "PRIVATE" ? "Private" : l.brokerStatus === "BROKER" ? "Broker" : "Unknown"}
                    </b>
                    {" · Fee: "}
                    <b>{l.brokerFeeStatus === "NONE" ? "None" : l.brokerFeeStatus === "EXISTS" ? "Exists" : "Unknown"}</b>
                    {l.brokerEvidence && (
                      <span className="text-slate-500"> · Evidence: <span dir="rtl">&quot;{l.brokerEvidence}&quot;</span></span>
                    )}
                    {l.brokerStatus !== "UNKNOWN" && (
                      <span className="text-xs text-slate-400"> ({l.brokerConfidence} confidence)</span>
                    )}
                  </div>
                  {priceHistory.length > 0 && (
                    <div className="text-xs text-slate-400 mt-1">
                      Price history: {priceHistory.map((h) => `₪${h.amount.toLocaleString()}`).join(" → ")}
                      {l.price != null ? ` → ₪${l.price.toLocaleString()} (current)` : ""}
                    </div>
                  )}
                </div>
                {l.url && (
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm shrink-0">
                    Open listing ↗
                  </a>
                )}
              </div>

              <div className={`mt-3 rounded p-3 text-sm font-medium border ${RECOMMENDED_ACTION_STYLES[m.status] ?? ""}`}>
                👉 {m.recommendedAction}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                <div>
                  {pos.length > 0 && (
                    <div>
                      <div className="font-medium text-green-700">Why it matched</div>
                      <ul className="list-disc list-inside text-slate-700">{pos.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                  {neg.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium text-red-700">Concerns</div>
                      <ul className="list-disc list-inside text-slate-700">{neg.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                </div>
                <div>
                  {missing.length > 0 && (
                    <div>
                      <div className="font-medium text-slate-700">Missing info</div>
                      <ul className="list-disc list-inside text-slate-600">{missing.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                  {flags.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium text-orange-700">🚩 Red flags</div>
                      <ul className="list-disc list-inside text-slate-700">{flags.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                </div>
              </div>

              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer">Raw listing text</summary>
                <pre dir="auto" className="whitespace-pre-wrap mt-1 bg-slate-50 p-2 rounded">{l.rawText}</pre>
              </details>

              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer">🔍 Debug: parsed fields (for real-world QA)</summary>
                <pre className="whitespace-pre-wrap mt-1 bg-slate-50 p-2 rounded font-mono">{debugFieldsText(l)}</pre>
              </details>

              <details className="mt-2 text-xs text-slate-500" open={Boolean(l.qaNotes)}>
                <summary className="cursor-pointer">📝 QA notes {l.qaNotes ? "" : "(none)"}</summary>
                <form action={saveListingNotes} className="mt-1 flex gap-2 items-start">
                  <input type="hidden" name="listingId" value={l.id} />
                  <textarea
                    name="qaNotes"
                    dir="auto"
                    rows={2}
                    defaultValue={l.qaNotes ?? ""}
                    placeholder='e.g. "price parsed wrong", "broker status wrong", "city missed", "should not be duplicate"'
                    className="flex-1 border border-slate-300 rounded px-2 py-1 text-xs"
                  />
                  <button type="submit" className="bg-slate-700 text-white px-2 py-1 rounded text-xs shrink-0">Save</button>
                </form>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

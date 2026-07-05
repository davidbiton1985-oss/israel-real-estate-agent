import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  strong_match: "bg-green-100 text-green-800 border-green-300",
  possible_match: "bg-yellow-100 text-yellow-800 border-yellow-300",
  weak_match: "bg-slate-100 text-slate-600 border-slate-300",
  rejected: "bg-red-50 text-red-700 border-red-200",
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

export default async function MatchesPage({ searchParams }: { searchParams: { scanned?: string; alertsSent?: string; outcome?: string } }) {
  const matches = await prisma.match.findMany({
    include: { profile: true, listing: true, alerts: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { score: "desc" },
  });

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
      {matches.length === 0 && (
        <p className="text-slate-500">No matches yet. Add a listing or run a scan from the dashboard.</p>
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

              <div className="mt-3 bg-slate-50 rounded p-2 text-sm">
                <b>Recommended action:</b> {m.recommendedAction}
              </div>

              <details className="mt-2 text-xs text-slate-500">
                <summary className="cursor-pointer">Raw listing text</summary>
                <pre dir="auto" className="whitespace-pre-wrap mt-1 bg-slate-50 p-2 rounded">{l.rawText}</pre>
              </details>
            </div>
          );
        })}
      </div>
    </div>
  );
}

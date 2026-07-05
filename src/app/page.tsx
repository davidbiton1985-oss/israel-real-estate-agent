import Link from "next/link";
import { prisma } from "@/lib/db";
import { runScanAction, sendTestAlertAction, deleteProfile } from "./actions";
import { twilioConfigVars } from "@/core/alert";

export const dynamic = "force-dynamic";

const BROKER_LABELS: Record<string, string> = {
  any: "הכל",
  private_only: "רק ללא תיווך",
  broker_only: "רק בתיווך",
  private_preferred_broker_allowed_if_strong_match: "עדיף ללא תיווך, אבל תיווך מותר אם הנכס מתאים מאוד",
  unknown_allowed: "לא משנה / גם לא ידוע",
};

export default async function Home({ searchParams }: { searchParams: { testAlert?: string } }) {
  const [profiles, listingCount, matchCount, pendingCount, latestTestAlert] = await Promise.all([
    prisma.profile.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.listing.count(),
    prisma.match.count({ where: { status: { in: ["strong_match", "possible_match"] } } }),
    prisma.listing.count({ where: { scanned: false } }),
    prisma.alert.findFirst({ where: { kind: "TEST_ALERT" }, orderBy: { createdAt: "desc" } }),
  ]);
  const twilio = twilioConfigVars();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex gap-3">
          <form action={runScanAction}>
            <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
              ▶ Run scan now {pendingCount > 0 ? `(${pendingCount} pending)` : ""}
            </button>
          </form>
          <form action={sendTestAlertAction}>
            <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
              📱 Send test alert
            </button>
          </form>
        </div>
      </div>

      <div className="bg-white rounded shadow p-4 text-sm space-y-2">
        <div className="font-semibold">WhatsApp (Twilio) status</div>
        {twilio.configured ? (
          <div className="text-green-700">✓ Configured — alerts will attempt real WhatsApp delivery.</div>
        ) : (
          <div className="text-amber-700">
            ⚠ Not configured — alerts fall back to console. Missing: <b>{twilio.missing.join(", ")}</b>. See <code>.env.example</code>.
          </div>
        )}
        {latestTestAlert && (
          <div className="border-t pt-2 mt-2">
            <div className="text-slate-500">Last test alert ({new Date(latestTestAlert.createdAt).toLocaleString()}):</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  latestTestAlert.status === "SENT" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                {latestTestAlert.status}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100">via {latestTestAlert.channel}</span>
            </div>
            {latestTestAlert.error && <div className="text-xs text-amber-700 mt-1">{latestTestAlert.error}</div>}
          </div>
        )}
      </div>

      {searchParams.testAlert && (
        <div className="bg-blue-100 border border-blue-300 rounded p-3 text-sm">
          Test alert attempted — see the WhatsApp status panel above for the result.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded shadow p-4"><div className="text-3xl font-bold">{profiles.length}</div><div className="text-slate-500">Search profiles</div></div>
        <div className="bg-white rounded shadow p-4"><div className="text-3xl font-bold">{listingCount}</div><div className="text-slate-500">Listings</div></div>
        <div className="bg-white rounded shadow p-4"><div className="text-3xl font-bold">{matchCount}</div><div className="text-slate-500">Strong/possible matches</div></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold">Search Profiles</h2>
          <Link href="/profiles/new" className="text-blue-600 hover:underline">+ New profile</Link>
        </div>
        {profiles.length === 0 && <p className="text-slate-500">No profiles yet. Create one, or run <code>npm run db:seed</code> for a demo.</p>}
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="bg-white rounded shadow p-4 flex items-start justify-between">
              <div>
                <div className="font-semibold">
                  {p.name}{" "}
                  <span className={`text-xs px-2 py-0.5 rounded ${p.dealType === "RENT" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}`}>
                    {p.dealType}
                  </span>{" "}
                  {!p.active && <span className="text-xs px-2 py-0.5 rounded bg-slate-200">inactive</span>}
                </div>
                <div className="text-sm text-slate-600 mt-1">
                  {p.cities} · up to ₪{p.priceMax.toLocaleString()}
                  {p.roomsMin ? ` · ${p.roomsMin}+ rooms` : ""}
                  {p.sizeMinSqm ? ` · ${p.sizeMinSqm}+ sqm` : ""}
                </div>
                <div className="text-sm mt-1" dir="rtl">
                  תיווך: <b>{BROKER_LABELS[p.brokerStatusPref] ?? p.brokerStatusPref}</b>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  WhatsApp alert ≥ {p.whatsappThreshold} · dashboard ≥ {p.dashboardThreshold} ·{" "}
                  {p.priceDropReAlert ? "re-alerts on price drop/changes" : "one alert only (no re-alerts)"}
                </div>
              </div>
              <div className="flex gap-2">
                <Link href={`/profiles/${p.id}`} className="text-blue-600 hover:underline text-sm">Edit</Link>
                <form action={deleteProfile}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-red-500 hover:underline text-sm">Delete</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

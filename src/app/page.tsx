import Link from "next/link";
import { prisma } from "@/lib/db";
import { runScanAction, sendTestAlertAction, deleteProfile } from "./actions";
import { twilioConfigVars } from "@/core/alert";
import { emailConfigVars } from "@/core/connectors/email";

export const dynamic = "force-dynamic";

const BROKER_LABELS: Record<string, string> = {
  any: "הכל",
  private_only: "רק ללא תיווך",
  broker_only: "רק בתיווך",
  private_preferred_broker_allowed_if_strong_match: "עדיף ללא תיווך, אבל תיווך מותר אם הנכס מתאים מאוד",
  unknown_allowed: "לא משנה / גם לא ידוע",
};

export default async function Home({ searchParams }: { searchParams: { testAlert?: string } }) {
  const [profiles, listingCount, matchCount, pendingCount, latestTestAlert, emailHealth, fbHealth, fbListingCount] = await Promise.all([
    prisma.profile.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.listing.count(),
    prisma.match.count({ where: { status: { in: ["strong_match", "possible_match"] } } }),
    prisma.listing.count({ where: { scanned: false } }),
    prisma.alert.findFirst({ where: { kind: "TEST_ALERT" }, orderBy: { createdAt: "desc" } }),
    prisma.sourceHealth.findUnique({ where: { source: "EMAIL" } }),
    prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } }),
    prisma.listing.count({ where: { source: "FACEBOOK" } }),
  ]);
  const twilio = twilioConfigVars();
  const email = emailConfigVars();

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
        <div className="font-semibold">🤖 Automatic ingestion (email alerts)</div>
        {email.configured ? (
          <div className="text-green-700">
            ✓ IMAP configured — the watcher ingests saved-search alert emails every scan.
            Run <code>npm run scheduler</code> to keep the 5-minute watcher alive.
          </div>
        ) : (
          <div className="text-amber-700">
            ⚠ Not configured — no automatic discovery yet. Missing: <b>{email.missing.join(", ")}</b>.
            Set up Yad2 saved-search email alerts + IMAP in <code>.env</code> (see README, ~5 minutes).
          </div>
        )}
        {emailHealth && (
          <div className="border-t pt-2 mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-600">
            <div>Last check: {emailHealth.lastCheckAt ? new Date(emailHealth.lastCheckAt).toLocaleString() : "never"}</div>
            <div>Last success: {emailHealth.lastSuccessAt ? new Date(emailHealth.lastSuccessAt).toLocaleString() : "never"}</div>
            <div>Last poll: {emailHealth.lastItemsFound} email(s), {emailHealth.lastNewListings} new listing(s)</div>
            <div>Total ingested: {emailHealth.totalIngested} · consecutive errors: {emailHealth.consecutiveErrors}</div>
            {emailHealth.lastError && (
              <div className="col-span-2 text-amber-700">Last error: {emailHealth.lastError}</div>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded shadow p-4 text-sm space-y-2">
        <div className="font-semibold">📘 Facebook monitoring</div>
        {email.configured ? (
          <div className="text-green-700">
            ✓ Automatic path active — Facebook notification emails (group/page posts) are ingested from the same inbox
            every scan. Subscribe to groups with &quot;All posts&quot; notifications (see README).
          </div>
        ) : (
          <div className="text-amber-700">
            ⚠ Automatic path needs IMAP — Facebook group/page notification emails ride the same inbox as Yad2 alerts.
            Configure IMAP in <code>.env</code>, then enable per-group &quot;All posts&quot; notifications (see README).
          </div>
        )}
        <div className="text-slate-600">
          One-click capture is always available for any Facebook surface (public posts, profiles, broker pages, shares,
          marketplace): select the post text and click the capture bookmarklet — see <code>docs/browser-helper.md</code>.
        </div>
        {(fbHealth || fbListingCount > 0) && (
          <div className="border-t pt-2 mt-2 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-600">
            <div>Facebook listings in system: {fbListingCount}</div>
            <div>Total auto/captured: {fbHealth?.totalIngested ?? 0}</div>
            <div>Last check: {fbHealth?.lastCheckAt ? new Date(fbHealth.lastCheckAt).toLocaleString() : "never"}</div>
            <div>Last poll: {fbHealth?.lastItemsFound ?? 0} FB email(s), {fbHealth?.lastNewListings ?? 0} new</div>
            {fbHealth?.lastError && <div className="col-span-2 text-amber-700">Last error: {fbHealth.lastError}</div>}
          </div>
        )}
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

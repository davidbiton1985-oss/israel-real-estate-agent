import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { saveListingNotes } from "@/app/actions";
import type { Listing } from "@prisma/client";
import { Button } from "@/components/ui/Button";
import ScoreBadge from "@/components/ui/ScoreBadge";
import FlashBanner from "@/components/ui/FlashBanner";
import AutoSubmitOnChange from "@/components/ui/AutoSubmitOnChange";
import Thumb from "@/components/ui/Thumb";
import PhotoPlaceholder from "@/components/ui/PhotoPlaceholder";
import Icon from "@/components/ui/Icon";
import { Select, Input, inputCls } from "@/components/ui/Field";
import { SOURCE_HE, DEAL_HE, BROKER_HE, OUTCOME_HE, USER_STATUS_HE } from "@/lib/labels";
import { hebrewCity, hebrewizeCities } from "@/core/alert";
import { price, dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "כל ההתאמות" };

function fmtDebug(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v === true) return "true";
  if (v === false) return "false";
  return String(v);
}

/** Plain-text dump of every parsed field, for real-world QA. Debug only. */
function debugFieldsText(l: Listing): string {
  const dedupType = l.fingerprint.split(":")[0];
  return [
    `source=${l.source}  url=${l.url ?? "—"}`,
    `yad2ListingId=${fmtDebug(l.yad2ListingId)}  fingerprint=${l.fingerprint} (${dedupType})`,
    `isDuplicateOf=${fmtDebug(l.isDuplicateOf)}  phone=${fmtDebug(l.phone)}  image=${fmtDebug(l.imageUrl)}`,
    `city=${fmtDebug(l.city)}  neighborhood=${fmtDebug(l.neighborhood)}  street=${fmtDebug(l.street)}`,
    `price=${fmtDebug(l.price)}  rooms=${fmtDebug(l.rooms)}  sqm=${fmtDebug(l.sizeSqm)}  floor=${fmtDebug(l.floor)}`,
    `broker=${fmtDebug(l.brokerStatus)}(${fmtDebug(l.brokerConfidence)})  fee=${fmtDebug(l.brokerFeeStatus)}`,
  ].join("\n");
}

function parseArr(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** "היום" / "אתמול" / "השבוע" / "מוקדם יותר" — freshness is the primary grouping. */
function dayGroup(d: Date): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= start) return "היום";
  if (t >= start - 86_400_000) return "אתמול";
  if (t >= start - 6 * 86_400_000) return "השבוע";
  return "מוקדם יותר";
}

interface MatchesSearchParams {
  scanned?: string;
  alertsSent?: string;
  emails?: string;
  scanError?: string;
  outcome?: string;
  profile?: string;
  status?: string;
  source?: string;
  broker?: string;
  alertReason?: string;
  hasRedFlags?: string;
  minScore?: string;
  dismissed?: string;
  debug?: string;
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
    if (m.listing.userStatus === "DISMISSED" && searchParams.dismissed !== "1") return false;
    if (searchParams.profile && m.profileId !== searchParams.profile) return false;
    // DEFAULT = relevant only; the system's rejects are QA material.
    if (!searchParams.status) {
      if (m.status !== "strong_match" && m.status !== "possible_match") return false;
    } else if (searchParams.status !== "all" && m.status !== searchParams.status) return false;
    if (searchParams.source && m.listing.source !== searchParams.source) return false;
    if (searchParams.broker && m.listing.brokerStatus !== searchParams.broker) return false;
    if (searchParams.alertReason && m.alerts[0]?.reason !== searchParams.alertReason) return false;
    if (searchParams.hasRedFlags === "1" && parseArr(m.redFlags).length === 0) return false;
    if (minScore != null && !isNaN(minScore) && m.score < minScore) return false;
    return true;
  });

  const GROUP_ORDER = ["היום", "אתמול", "השבוע", "מוקדם יותר"];
  const groups = new Map<string, typeof matches>();
  for (const m of matches) {
    const g = dayGroup(m.listing.createdAt);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(m);
  }
  for (const g of Array.from(groups.values())) g.sort((a, b) => b.score - a.score);

  const activeFilters = [
    searchParams.profile,
    searchParams.source,
    searchParams.broker,
    searchParams.alertReason,
    searchParams.minScore,
    searchParams.hasRedFlags,
  ].filter(Boolean).length;

  // segment definitions: which chip is "on"
  const seg = searchParams.dismissed === "1" ? "dismissed" : (searchParams.status ?? "");

  return (
    <div>
      <div className="flex items-baseline justify-between pt-3">
        <h1 className="display text-[24px]">כל ההתאמות</h1>
        <span className="tnum text-sm text-muted">
          {matches.length} מתוך {allMatches.length}
        </span>
      </div>

      {searchParams.scanError ? (
        <FlashBanner clear={["scanned", "alertsSent", "emails", "scanError"]} autoHideMs={0}>
          <div className="mt-3 rounded-xl2 bg-card p-3.5 text-sm shadow-card">
            <div className="font-bold text-crit">✗ בדיקת האימייל נכשלה — התוצאות חלקיות.</div>
            <div className="mt-1 text-xs text-muted">{searchParams.scanError}</div>
          </div>
        </FlashBanner>
      ) : searchParams.scanned ? (
        <FlashBanner clear={["scanned", "alertsSent", "emails"]}>
          <div className="mt-3 rounded-xl2 bg-card p-3.5 text-sm font-semibold text-accent shadow-card">
            ✓{" "}
            {searchParams.scanned === "0"
              ? `נבדקו ${searchParams.emails ?? 0} אימיילים — אין מודעות חדשות.`
              : `הבדיקה הושלמה — עובדו ${searchParams.scanned} מודעות, נשלחו ${searchParams.alertsSent ?? 0} התראות.`}
          </div>
        </FlashBanner>
      ) : null}
      {searchParams.outcome && (
        <FlashBanner clear={["outcome", "listingId"]}>
          <div className="mt-3 rounded-xl2 bg-card p-3.5 text-sm font-semibold text-accent shadow-card">
            ✓ {OUTCOME_HE[searchParams.outcome] ?? "המודעה עובדה."}
          </div>
        </FlashBanner>
      )}

      {/* segments */}
      <div className="scrollbar-none -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {[
          { href: "/matches", label: "רלוונטיות", on: seg === "" },
          { href: "/matches?status=all", label: "הכל", on: seg === "all" },
          { href: "/matches?status=possible_match", label: "לבדיקה", on: seg === "possible_match" },
          { href: "/matches?status=all&dismissed=1", label: "שנדחו", on: seg === "dismissed" },
        ].map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`flex-none rounded-full px-4 py-2.5 text-[13.5px] font-bold transition-all active:scale-95 ${
              s.on ? "bg-ink text-white" : "bg-card text-muted shadow-card"
            }`}
          >
            {s.label}
          </Link>
        ))}
        <details className="re-collapse relative flex-none">
          <summary
            className={`flex min-h-[42px] items-center gap-1 rounded-full px-4 text-[13.5px] font-bold ${
              activeFilters > 0 ? "bg-accent text-white" : "bg-card text-muted shadow-card"
            }`}
          >
            סינון{activeFilters > 0 ? ` · ${activeFilters}` : ""}
          </summary>
        </details>
      </div>

      {/* the full filter form — revealed by the סינון chip */}
      <details className="re-collapse mt-2">
        <summary className="px-1 text-[12.5px] font-semibold text-muted">
          <span className="chev inline-flex">
            <Icon name="chevron" size={10} />
          </span>{" "}
          סינון מתקדם{activeFilters > 0 ? ` (${activeFilters} פעילים)` : ""}
        </summary>
        <form method="GET" className="mt-3 flex flex-wrap items-end gap-3 rounded-xl2 bg-card p-4 text-sm shadow-card">
          <AutoSubmitOnChange />
          {searchParams.status && <input type="hidden" name="status" value={searchParams.status} />}
          {searchParams.dismissed && <input type="hidden" name="dismissed" value={searchParams.dismissed} />}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">פרופיל</span>
            <Select name="profile" defaultValue={searchParams.profile ?? ""} className="w-auto min-w-28">
              <option value="">הכל</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">מקור</span>
            <Select name="source" defaultValue={searchParams.source ?? ""} className="w-auto min-w-28">
              <option value="">הכל</option>
              <option value="YAD2">יד2</option>
              <option value="YAD2_BROWSER">יד2 (טאב)</option>
              <option value="FACEBOOK">פייסבוק</option>
              <option value="MANUAL">ידני</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">תיווך</span>
            <Select name="broker" defaultValue={searchParams.broker ?? ""} className="w-auto min-w-28">
              <option value="">הכל</option>
              <option value="PRIVATE">פרטי</option>
              <option value="BROKER">מתיווך</option>
              <option value="UNKNOWN">לא ידוע</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">ציון מינימלי</span>
            <Input name="minScore" type="number" min={0} max={100} defaultValue={searchParams.minScore ?? ""} className="w-24" />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
            <input type="checkbox" name="hasRedFlags" value="1" defaultChecked={searchParams.hasRedFlags === "1"} className="h-4 w-4 accent-[var(--accent)]" />
            רק עם דגלים
          </label>
          <div className="flex items-center gap-2 pb-0.5">
            <Button size="sm">סנן</Button>
            <a href="/matches" className="text-xs text-muted hover:text-ink hover:underline">
              נקה
            </a>
          </div>
        </form>
      </details>

      {matches.length === 0 && (
        <div className="mt-8 rounded-xl2 bg-card p-8 text-center shadow-card">
          <div className="text-3xl">🔍</div>
          <div className="mt-2 text-[16px] font-bold">
            {activeFilters > 0 || searchParams.status ? "אין התאמות בסינון הזה" : "עדיין אין התאמות"}
          </div>
          <p className="mx-auto mt-1 max-w-[270px] text-sm leading-relaxed text-muted">
            {activeFilters > 0 || searchParams.status
              ? "נסה לנקות את הסינון או לעבור ל״הכל״."
              : "כשהחיישנים יקלטו מודעות מתאימות הן יופיעו כאן."}
          </p>
        </div>
      )}

      {GROUP_ORDER.filter((g) => groups.has(g)).map((groupName) => (
        <section key={groupName}>
          <div className="whisper mt-7 px-1">{groupName}</div>
          <div className="mt-3 space-y-3">
            {groups.get(groupName)!.map((m) => {
              const l = m.listing;
              const pos = parseArr(m.reasonsPositive);
              const facts = [
                l.rooms != null ? `${l.rooms} חד׳` : null,
                l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
                l.dealType ? DEAL_HE[l.dealType] : null,
                BROKER_HE[l.brokerStatus] === "לא ידוע" ? null : BROKER_HE[l.brokerStatus],
                SOURCE_HE[l.source] ?? l.source,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={m.id} className="overflow-hidden rounded-[18px] bg-card shadow-card">
                  <Link href={`/listing/${l.id}`} className="flex">
                    <div className="w-[104px] flex-none bg-card2">
                      {l.imageUrl ? (
                        <Thumb src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <PhotoPlaceholder compact />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 p-3.5">
                      <div className="text-[15px] font-bold leading-snug">
                        {[hebrewCity(l.city), l.neighborhood ?? l.street].filter(Boolean).join(" · ") || "מיקום לא ידוע"}
                      </div>
                      <div className="display tnum mt-1 text-[17px] leading-none">
                        {l.price != null ? price(l.price) : <span className="font-body text-[13px] font-semibold text-muted">מחיר לא צוין</span>}
                      </div>
                      <div className="tnum mt-1 truncate text-[12.5px] text-muted">{facts}</div>
                      {pos[0] && <div className="mt-1 truncate text-[12px] font-semibold text-accent">✓ {hebrewizeCities(pos[0])}</div>}
                      <div className="mt-1.5 flex items-baseline">
                        <ScoreBadge score={m.score} showWord={false} />
                        <span className="ms-auto flex items-center gap-2 text-[11px] text-muted">
                          {l.userStatus !== "NEW" && <b className="text-accent">{USER_STATUS_HE[l.userStatus]}</b>}
                          {m.alerts[0]?.status === "SENT" && "🔔"}
                          {dateTime(l.createdAt).split(",")[0]}
                        </span>
                      </div>
                    </div>
                  </Link>
                  {searchParams.debug === "1" && (
                    <div className="border-t border-line px-3.5 py-2 text-xs">
                      <details className="re-collapse">
                        <summary className="text-faint">שדות מפוענחים</summary>
                        <pre dir="ltr" className="tnum mt-2 whitespace-pre-wrap rounded-badge bg-card2 p-3 text-start font-mono text-[11px] text-muted">
                          {debugFieldsText(l)}
                        </pre>
                      </details>
                      <details className="re-collapse mt-1" open={Boolean(l.qaNotes)}>
                        <summary className="text-faint">הערות QA{l.qaNotes ? " ●" : ""}</summary>
                        <form action={saveListingNotes} className="mt-2 flex items-start gap-2">
                          <input type="hidden" name="listingId" value={l.id} />
                          <textarea name="qaNotes" dir="auto" rows={2} defaultValue={l.qaNotes ?? ""} className={`${inputCls} flex-1 text-xs`} />
                          <Button size="sm" variant="secondary">
                            שמור
                          </Button>
                        </form>
                      </details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

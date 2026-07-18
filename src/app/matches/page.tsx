import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { saveListingNotes } from "@/app/actions";
import type { Listing } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Sparkline from "@/components/ui/Sparkline";
import EmptyState from "@/components/ui/EmptyState";
import FlashBanner from "@/components/ui/FlashBanner";
import AutoSubmitOnChange from "@/components/ui/AutoSubmitOnChange";
import Thumb from "@/components/ui/Thumb";
import Icon from "@/components/ui/Icon";
import { Select, Input, inputCls } from "@/components/ui/Field";
import { SOURCE_HE, STATUS_HE, DEAL_HE, BROKER_HE, OUTCOME_HE, USER_STATUS_HE } from "@/lib/labels";
import { hebrewCity, hebrewizeCities } from "@/core/alert";
import { price, dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "התאמות" };

function fmtDebug(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (v === true) return "true";
  if (v === false) return "false";
  return String(v);
}

/** Plain-text dump of every parsed field, for real-world QA. Debug only. */
function debugFieldsText(l: Listing): string {
  const dedupType = l.fingerprint.split(":")[0];
  const lines = [
    `source=${l.source}  url=${l.url ?? "—"}`,
    ...(l.source === "FACEBOOK"
      ? [`fbSurface=${fmtDebug(l.fbSurface)}  fbSourceName=${fmtDebug(l.fbSourceName)}  fbAuthor=${fmtDebug(l.fbAuthor)}`]
      : []),
    `yad2ListingId=${fmtDebug(l.yad2ListingId)}`,
    `fingerprint=${l.fingerprint}  (dedup key type: ${dedupType})`,
    `isDuplicateOf=${fmtDebug(l.isDuplicateOf)}`,
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
  /** ?dismissed=1 shows listings David marked לא רלוונטי (hidden by default). */
  dismissed?: string;
  /** ?debug=1 reveals the parsed-fields dump (QA console mode). */
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
    // David said "לא רלוונטי" — it leaves the working view (opt back in via checkbox)
    if (m.listing.userStatus === "DISMISSED" && searchParams.dismissed !== "1") return false;
    if (searchParams.profile && m.profileId !== searchParams.profile) return false;
    // DEFAULT = relevant only (strong+possible). The system's own rejects are
    // QA material, not user content — they show only when explicitly asked
    // (status=all / a specific status).
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

  // Group by listing freshness, newest group first; inside a group score wins.
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
    searchParams.status,
    searchParams.source,
    searchParams.broker,
    searchParams.alertReason,
    searchParams.minScore,
    searchParams.hasRedFlags,
    searchParams.dismissed,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="font-display text-3xl font-bold">התאמות</h1>
        <span className="tnum text-sm text-muted">
          מציג {matches.length} מתוך {allMatches.length}
        </span>
      </div>

      {searchParams.scanError ? (
        <FlashBanner clear={["scanned", "alertsSent", "emails", "scanError"]} autoHideMs={0}>
          <div className="rounded-xl2 border border-line bg-crit-soft px-4 py-3 text-sm text-crit">
            <span className="flex items-center gap-2 font-medium">
              <Icon name="x" size={16} />
              בדיקת האימייל נכשלה — התוצאות למטה חלקיות.
            </span>
            <div className="mt-1 text-xs">{searchParams.scanError}</div>
          </div>
        </FlashBanner>
      ) : searchParams.scanned ? (
        <FlashBanner clear={["scanned", "alertsSent", "emails"]}>
          <div className="flex items-center gap-2 rounded-xl2 border border-line bg-good-soft px-4 py-3 text-sm text-good">
            <Icon name="check" size={16} />
            {searchParams.scanned === "0"
              ? `נבדקו ${searchParams.emails ?? 0} אימיילים — אין מודעות חדשות.`
              : `הבדיקה הושלמה — עובדו ${searchParams.scanned} מודעות, נשלחו ${searchParams.alertsSent ?? 0} התראות.`}
          </div>
        </FlashBanner>
      ) : null}
      {searchParams.outcome && (
        <FlashBanner clear={["outcome", "listingId"]}>
          <div className="flex items-center gap-2 rounded-xl2 border border-line bg-accent-soft px-4 py-3 text-sm text-accent">
            <Icon name="check" size={16} />
            {OUTCOME_HE[searchParams.outcome] ?? "המודעה עובדה."}
          </div>
        </FlashBanner>
      )}

      {/* Filter bar — collapsed by default (phone-first); selects auto-submit */}
      <Card className="px-4 py-1">
        <details className="re-collapse">
          <summary className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-muted">
            <span className="chev inline-flex">
              <Icon name="chevron" size={11} />
            </span>
            סינון
            {activeFilters > 0 && (
              <span className="tnum rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent">{activeFilters}</span>
            )}
          </summary>
          <form method="GET" className="flex flex-wrap items-end gap-3 pb-3 pt-1 text-sm">
            <AutoSubmitOnChange />
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
            <span className="text-xs text-muted">סטטוס</span>
            <Select name="status" defaultValue={searchParams.status ?? ""} className="w-auto min-w-28">
              <option value="">רלוונטיות</option>
              <option value="strong_match">חזקה</option>
              <option value="possible_match">אפשרית</option>
              <option value="weak_match">חלשה</option>
              <option value="rejected">נדחו</option>
              <option value="all">הכל (כולל דחויות)</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">מקור</span>
            <Select name="source" defaultValue={searchParams.source ?? ""} className="w-auto min-w-28">
              <option value="">הכל</option>
              <option value="YAD2">יד2</option>
              <option value="FACEBOOK">פייסבוק</option>
              <option value="WHATSAPP">וואטסאפ</option>
              <option value="MANUAL">ידני</option>
              <option value="URL">קישור</option>
              <option value="DEMO">דמו</option>
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
            <span className="text-xs text-muted">סוג התראה</span>
            <Select name="alertReason" defaultValue={searchParams.alertReason ?? ""} className="w-auto min-w-28">
              <option value="">הכל</option>
              <option value="NEW_MATCH">התאמה חדשה</option>
              <option value="PRICE_DROP">ירידת מחיר</option>
              <option value="MATERIAL_CHANGE">שינוי בפרטים</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">ציון מינימלי</span>
            <Input name="minScore" type="number" min={0} max={100} defaultValue={searchParams.minScore ?? ""} className="w-20" />
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
            <input type="checkbox" name="hasRedFlags" value="1" defaultChecked={searchParams.hasRedFlags === "1"} className="h-4 w-4 accent-[var(--accent)]" />
            רק עם דגלים אדומים
          </label>
          <label className="flex items-center gap-1.5 pb-2 text-xs text-muted">
            <input type="checkbox" name="dismissed" value="1" defaultChecked={searchParams.dismissed === "1"} className="h-4 w-4 accent-[var(--accent)]" />
            הצג גם שנדחו
          </label>
          <div className="flex items-center gap-2 pb-0.5">
            <Button size="sm" icon="filter">
              סנן
            </Button>
            <a href="/matches" className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
              נקה
            </a>
          </div>
          </form>
        </details>
      </Card>

      {matches.length === 0 &&
        // Don't blame a filter that isn't applied: unfiltered-empty means the
        // system hasn't matched anything — point at the sensors, not the UI.
        ([searchParams.profile, searchParams.status, searchParams.source, searchParams.broker, searchParams.alertReason, searchParams.hasRedFlags, searchParams.minScore].some(Boolean) ? (
          <EmptyState icon="search" title="אין התאמות בסינון הזה">
            נסה לנקות את הסינון, להוסיף מודעה ידנית, או להריץ בדיקה מהדשבורד.
          </EmptyState>
        ) : (
          <EmptyState icon="spark" title="עדיין אין התאמות">
            כשהחיישנים יקלטו מודעות שמתאימות לפרופיל הן יופיעו כאן — ודא בדשבורד שהחיישנים פעילים.
          </EmptyState>
        ))}

      {GROUP_ORDER.filter((g) => groups.has(g)).map((groupName) => (
        <section key={groupName}>
          {/* monday group header: colored bold title + count */}
          <div
            className={`mb-2 mt-2 flex items-baseline gap-2 px-0.5 text-[15px] font-bold ${
              groupName === "היום" ? "text-accent" : "text-muted"
            }`}
          >
            <span className="text-[10px]">▼</span>
            {groupName}
            <span className="tnum text-xs font-medium text-muted">{groups.get(groupName)!.length}</span>
          </div>
          {/* joined board rows, one container per day-group — same visual
              language as the dashboard; the deep details live on דף דירה */}
          <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
            {groups.get(groupName)!.map((m) => {
              const pos = parseArr(m.reasonsPositive);
              const flags = parseArr(m.redFlags);
              const l = m.listing;
              const history = parsePriceHistory(l.priceHistory);
              const sparkValues = l.price != null ? [...history.map((h) => h.amount), l.price] : history.map((h) => h.amount);
              const latestAlert = m.alerts[0];
              const strip =
                l.userStatus === "DISMISSED"
                  ? "bg-[#c4c4c4]"
                  : m.status === "strong_match"
                    ? "bg-good"
                    : m.status === "possible_match"
                      ? "bg-warn"
                      : "bg-[#c4c4c4]";
              const facts = [
                l.rooms != null ? `${l.rooms} חד׳` : null,
                l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
                l.dealType ? DEAL_HE[l.dealType] : null,
                BROKER_HE[l.brokerStatus] === "לא ידוע" ? null : BROKER_HE[l.brokerStatus],
                SOURCE_HE[l.source] ?? l.source,
                dateTime(l.createdAt),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={m.id} className="relative border-b border-line p-3 pe-4 ps-[18px] last:border-b-0">
                  <span className={`absolute inset-y-0 start-0 w-[6px] ${strip}`} aria-hidden="true" />

                  <div className="flex gap-3">
                    {l.imageUrl && (
                      <Link href={`/listing/${l.id}`} className="flex-none">
                        <Thumb src={l.imageUrl} alt="" className="h-[64px] w-[64px] rounded-badge border border-line object-cover" />
                      </Link>
                    )}
                    <div className="min-w-0 flex-1">
                      {/* title … price */}
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/listing/${l.id}`}
                          className="min-w-0 truncate text-[15px] font-bold transition-colors hover:text-accent"
                        >
                          {[hebrewCity(l.city), l.neighborhood, l.street].filter(Boolean).join(" · ") || "מיקום לא ידוע"}
                        </Link>
                        <div className="tnum figtree flex-none text-[17px] font-bold">
                          {l.price != null ? price(l.price) : <span className="text-sm font-medium text-muted">מחיר לא צוין</span>}
                        </div>
                      </div>

                      {/* facts */}
                      <div className="tnum mt-0.5 truncate text-xs text-muted">{facts}</div>
                    </div>
                  </div>

                  {/* one reason, one flag — the argument, not the whole file */}
                  {pos[0] && <div className="mt-1 truncate text-xs font-medium text-[#00854d]">✓ {hebrewizeCities(pos[0])}</div>}
                  {flags[0] && <div className="mt-0.5 truncate text-xs font-medium text-[#b06000]">🚩 {hebrewizeCities(flags[0])}</div>}
                  {latestAlert?.error && <div className="mt-1 truncate text-xs text-crit">{latestAlert.error}</div>}

                  {/* price history — the trend at a glance */}
                  {history.length > 0 && sparkValues.length >= 2 && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-faint">
                      <Sparkline values={sparkValues} width={80} height={20} />
                      <span className="tnum" dir="ltr">
                        {sparkValues.map((v) => v.toLocaleString("en-US")).join(" → ")} ₪
                      </span>
                    </div>
                  )}

                  {/* chips + actions */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <ScoreBadge score={m.score} />
                    {(m.status === "weak_match" || m.status === "rejected") && (
                      <Badge tone="neutral">{STATUS_HE[m.status] ?? m.status}</Badge>
                    )}
                    {l.userStatus !== "NEW" && <Badge tone="accent">{USER_STATUS_HE[l.userStatus]}</Badge>}
                    {latestAlert?.status === "SENT" && (
                      <Badge tone="neutral" icon="bell">
                        נשלחה
                      </Badge>
                    )}
                    {l.isDuplicateOf && (
                      <Link href={`/listing/${l.isDuplicateOf}`} title="פתח את המודעה המקורית">
                        <Badge tone="warn" icon="flag">
                          כפילות
                        </Badge>
                      </Link>
                    )}
                    <span className="ms-auto flex gap-2">
                      {l.phone && (
                        <a
                          href={`tel:${l.phone}`}
                          className="inline-flex items-center justify-center rounded-badge border border-accent bg-card px-3 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-accent-soft active:scale-[0.98]"
                        >
                          📞
                        </a>
                      )}
                      <ButtonLink href={`/listing/${l.id}`} variant="primary" size="sm">
                        דף דירה
                      </ButtonLink>
                      {l.url && (
                        <ButtonLink href={l.url} external variant="secondary" size="sm" icon="external">
                          מודעה
                        </ButtonLink>
                      )}
                    </span>
                  </div>

                  {/* quiet extras — QA tooling only in debug mode */}
                  <div className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-1 text-xs">
                    <details className="re-collapse open:basis-full">
                      <summary className="inline-flex items-center gap-1 text-faint transition-colors hover:text-ink">
                        <span className="chev inline-flex">
                          <Icon name="chevron" size={10} />
                        </span>
                        הפוסט המקורי
                      </summary>
                      <pre dir="auto" className="mt-2 whitespace-pre-wrap rounded-badge bg-card2/60 p-3 text-xs text-muted">
                        {l.rawText}
                      </pre>
                    </details>
                    {searchParams.debug === "1" && (
                      <>
                        <details className="re-collapse open:basis-full">
                          <summary className="inline-flex items-center gap-1 text-faint transition-colors hover:text-ink">
                            <span className="chev inline-flex">
                              <Icon name="chevron" size={10} />
                            </span>
                            שדות מפוענחים
                          </summary>
                          <pre dir="ltr" className="tnum mt-2 whitespace-pre-wrap rounded-badge bg-card2/60 p-3 text-start font-mono text-xs text-muted">
                            {debugFieldsText(l)}
                          </pre>
                        </details>
                        <details className="re-collapse open:basis-full" open={Boolean(l.qaNotes)}>
                          <summary className="inline-flex items-center gap-1 text-faint transition-colors hover:text-ink">
                            <span className="chev inline-flex">
                              <Icon name="chevron" size={10} />
                            </span>
                            הערות QA{l.qaNotes ? " ●" : ""}
                          </summary>
                          <form action={saveListingNotes} className="mt-2 flex items-start gap-2">
                            <input type="hidden" name="listingId" value={l.id} />
                            <textarea
                              name="qaNotes"
                              dir="auto"
                              rows={2}
                              defaultValue={l.qaNotes ?? ""}
                              placeholder="למשל: המחיר פוענח לא נכון · העיר לא זוהתה · לא אמור להיות כפילות"
                              className={`${inputCls} flex-1 text-xs`}
                            />
                            <Button size="sm" variant="secondary">
                              שמור
                            </Button>
                          </form>
                        </details>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

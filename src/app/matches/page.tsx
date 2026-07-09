import { prisma } from "@/lib/db";
import { saveListingNotes } from "@/app/actions";
import type { Listing } from "@prisma/client";
import { Card } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Sparkline from "@/components/ui/Sparkline";
import Collapse from "@/components/ui/Collapse";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import { Select, Input, inputCls } from "@/components/ui/Field";
import {
  SOURCE_HE,
  STATUS_HE,
  STATUS_TONE,
  DEAL_HE,
  BROKER_HE,
  FEE_HE,
  CONFIDENCE_HE,
  FB_SURFACE_HE,
  OUTCOME_HE,
  ALERT_REASON_HE,
  ALERT_STATUS_HE,
  ALERT_STATUS_TONE,
} from "@/lib/labels";
import { price, dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

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

// Recommended-action strip: status color follows match status.
const ACTION_STRIP: Record<string, string> = {
  strong_match: "bg-good-soft text-good",
  possible_match: "bg-warn-soft text-warn",
  weak_match: "bg-card2 text-muted",
  rejected: "bg-card2 text-faint",
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

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <h1 className="font-display text-3xl font-bold">התאמות</h1>
        <span className="tnum text-sm text-muted">
          מציג {matches.length} מתוך {allMatches.length}
        </span>
      </div>

      {searchParams.scanned && (
        <div className="flex items-center gap-2 rounded-xl2 border border-line bg-accent-soft px-4 py-3 text-sm text-accent">
          <Icon name="check" size={16} />
          הסריקה הושלמה — עובדו {searchParams.scanned} מודעות, נשלחו {searchParams.alertsSent ?? 0} התראות.
        </div>
      )}
      {searchParams.outcome && (
        <div className="flex items-center gap-2 rounded-xl2 border border-line bg-accent-soft px-4 py-3 text-sm text-accent">
          <Icon name="check" size={16} />
          {OUTCOME_HE[searchParams.outcome] ?? "המודעה עובדה."}
        </div>
      )}

      {/* Filter bar — GET form, same param names as before */}
      <Card className="p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3 text-sm">
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
              <option value="">הכל</option>
              <option value="strong_match">חזקה</option>
              <option value="possible_match">אפשרית</option>
              <option value="weak_match">חלשה</option>
              <option value="rejected">נדחו</option>
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
          <div className="flex items-center gap-2 pb-0.5">
            <Button size="sm" icon="filter">
              סנן
            </Button>
            <a href="/matches" className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline">
              נקה
            </a>
          </div>
        </form>
      </Card>

      {matches.length === 0 && (
        <EmptyState icon="search" title="אין התאמות בסינון הזה">
          נסה לנקות את הסינון, להוסיף מודעה ידנית, או להריץ סריקה מהדשבורד.
        </EmptyState>
      )}

      <div className="space-y-4">
        {matches.map((m) => {
          const pos = parseArr(m.reasonsPositive);
          const neg = parseArr(m.reasonsNegative);
          const missing = parseArr(m.missingFields);
          const flags = parseArr(m.redFlags);
          const l = m.listing;
          const history = parsePriceHistory(l.priceHistory);
          const sparkValues = l.price != null ? [...history.map((h) => h.amount), l.price] : history.map((h) => h.amount);
          const latestAlert = m.alerts[0];
          return (
            <Card key={m.id} className="p-5">
              {/* Top row: score ring · badges · open-listing */}
              <div className="flex items-start gap-4">
                <ScoreBadge score={m.score} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{STATUS_HE[m.status] ?? m.status}</Badge>
                    <Badge tone="neutral">{SOURCE_HE[l.source] ?? l.source}</Badge>
                    {l.source === "FACEBOOK" && l.fbSurface && (
                      <Badge tone="neutral">
                        {FB_SURFACE_HE[l.fbSurface] ?? l.fbSurface}
                        {l.fbSourceName ? `: ${l.fbSourceName}` : ""}
                      </Badge>
                    )}
                    {l.isDuplicateOf && (
                      <Badge tone="warn" icon="flag">
                        כפילות
                      </Badge>
                    )}
                    {latestAlert && (
                      <Badge tone={ALERT_STATUS_TONE[latestAlert.status] ?? "neutral"} icon="bell">
                        התראה {ALERT_STATUS_HE[latestAlert.status] ?? latestAlert.status}
                        {latestAlert.reason && ALERT_REASON_HE[latestAlert.reason]
                          ? ` · ${ALERT_REASON_HE[latestAlert.reason]}`
                          : ""}
                      </Badge>
                    )}
                  </div>

                  {/* Key facts */}
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                    <span className="tnum font-display text-2xl font-bold">
                      {l.price != null ? price(l.price) : "מחיר לא צוין"}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <Icon name="pin" size={14} />
                      {[l.city, l.neighborhood, l.street].filter(Boolean).join(", ") || "מיקום לא ידוע"}
                    </span>
                    {l.rooms != null && (
                      <span className="tnum flex items-center gap-1.5 text-sm text-muted">
                        <Icon name="grid" size={14} />
                        {l.rooms} חדרים
                      </span>
                    )}
                    {l.sizeSqm != null && (
                      <span className="tnum flex items-center gap-1.5 text-sm text-muted">
                        <Icon name="expand" size={14} />
                        {l.sizeSqm} מ״ר
                      </span>
                    )}
                    <span className="text-sm text-muted">{l.dealType ? DEAL_HE[l.dealType] : "סוג עסקה לא ידוע"}</span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span>
                      פרופיל: <b className="text-ink">{m.profile.name}</b>
                    </span>
                    <span>
                      תיווך:{" "}
                      <b className={l.brokerStatus === "PRIVATE" ? "text-good" : l.brokerStatus === "BROKER" ? "text-accent" : "text-muted"}>
                        {BROKER_HE[l.brokerStatus]}
                      </b>{" "}
                      · {FEE_HE[l.brokerFeeStatus]}
                      {l.brokerStatus !== "UNKNOWN" && (
                        <span className="text-xs text-faint"> ({CONFIDENCE_HE[l.brokerConfidence]})</span>
                      )}
                    </span>
                    {l.brokerEvidence && <span className="text-xs text-faint">״{l.brokerEvidence}״</span>}
                  </div>

                  {history.length > 0 && sparkValues.length >= 2 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-faint">
                      <Sparkline values={sparkValues} />
                      <span className="tnum" dir="ltr">
                        {sparkValues.map((v) => v.toLocaleString("en-US")).join(" → ")} ₪
                      </span>
                    </div>
                  )}

                  {latestAlert?.sentAt && (
                    <div className="tnum mt-1 text-xs text-faint">נשלחה {dateTime(latestAlert.sentAt)}</div>
                  )}
                  {latestAlert?.error && <div className="mt-1 text-xs text-warn">{latestAlert.error}</div>}
                </div>

                {l.url && (
                  <div className="shrink-0">
                    <ButtonLink href={l.url} external variant="secondary" size="sm" icon="external">
                      פתח מודעה
                    </ButtonLink>
                  </div>
                )}
              </div>

              {/* Recommended action */}
              <div className={`mt-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${ACTION_STRIP[m.status] ?? "bg-card2 text-muted"}`}>
                <Icon name="spark" size={15} />
                {m.recommendedAction}
              </div>

              {/* Reasons — two columns */}
              {(pos.length > 0 || neg.length > 0 || missing.length > 0 || flags.length > 0) && (
                <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <div className="space-y-3">
                    {pos.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1.5 font-medium text-good">
                          <Icon name="check" size={14} />
                          למה זה התאים
                        </div>
                        <ul className="space-y-0.5 text-muted">
                          {pos.map((r, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-faint">·</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {neg.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1.5 font-medium text-crit">
                          <Icon name="x" size={14} />
                          נקודות חולשה
                        </div>
                        <ul className="space-y-0.5 text-muted">
                          {neg.map((r, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-faint">·</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {missing.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1.5 font-medium text-muted">
                          <Icon name="search" size={14} />
                          מידע חסר — לברר בשיחה
                        </div>
                        <ul className="space-y-0.5 text-muted">
                          {missing.map((r, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-faint">·</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {flags.length > 0 && (
                      <div>
                        <div className="mb-1 flex items-center gap-1.5 font-medium text-warn">
                          <Icon name="flag" size={14} />
                          דגלים אדומים
                        </div>
                        <ul className="space-y-0.5 text-muted">
                          {flags.map((r, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-faint">·</span>
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quiet details */}
              <div className="mt-4 space-y-2">
                <Collapse summary="הפוסט המקורי">
                  <pre dir="auto" className="whitespace-pre-wrap text-xs text-muted">
                    {l.rawText}
                  </pre>
                </Collapse>
                <Collapse summary="🔍 שדות מפוענחים (בדיקת איכות)">
                  <pre dir="ltr" className="tnum whitespace-pre-wrap text-start font-mono text-xs text-muted">
                    {debugFieldsText(l)}
                  </pre>
                </Collapse>
                <Collapse summary={`📝 הערות QA ${l.qaNotes ? "" : "(אין)"}`} defaultOpen={Boolean(l.qaNotes)}>
                  <form action={saveListingNotes} className="flex items-start gap-2">
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
                </Collapse>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

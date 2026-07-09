import Link from "next/link";
import { prisma } from "@/lib/db";
import { runScanAction, sendTestAlertAction, deleteProfile } from "./actions";
import { twilioConfigVars } from "@/core/alert";
import { emailConfigVars } from "@/core/connectors/email";
import { Card, SectionTitle } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import SubmitButton from "@/components/ui/SubmitButton";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import ScoreBadge from "@/components/ui/ScoreBadge";
import StatusDot, { type DotState } from "@/components/ui/StatusDot";
import EmptyState from "@/components/ui/EmptyState";
import Icon, { type IconName } from "@/components/ui/Icon";
import { BROKER_PREF_HE, BROKER_HE, DEAL_HE, SOURCE_HE } from "@/lib/labels";
import { price, relTime, minutesSince } from "@/lib/format";
import type { SourceHealth } from "@prisma/client";

export const dynamic = "force-dynamic";

// Watchers deliver every ~5 minutes; under 12 counts as live, under 6h stale.
function freshness(h: SourceHealth | null | undefined): DotState {
  if (!h) return "off";
  if (h.consecutiveErrors > 0) return "error";
  const mins = minutesSince(h.lastSuccessAt);
  if (mins == null) return "off";
  if (mins < 12) return "live";
  if (mins < 360) return "stale";
  return "off";
}

const DOT_LABEL: Record<DotState, string> = {
  live: "פעיל",
  stale: "לא עדכני",
  error: "שגיאה",
  off: "לא מחובר",
};

function SourceCell({
  title,
  icon,
  state,
  when,
  note,
}: {
  title: string;
  icon: IconName;
  state: DotState;
  when: string;
  note?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3" title={note ?? undefined}>
      <span className="text-muted">
        <Icon name={icon} size={16} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {title}
          <StatusDot state={state} />
        </div>
        <div className="truncate text-xs text-faint">
          {DOT_LABEL[state]} · {when}
        </div>
      </div>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: { testAlert?: string } }) {
  const [profiles, listingCount, strongCount, pendingCount, latestTestAlert, emailHealth, fbHealth, yad2Health, heroMatches] = await Promise.all([
    prisma.profile.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.listing.count(),
    prisma.match.count({ where: { status: "strong_match" } }),
    prisma.listing.count({ where: { scanned: false } }),
    prisma.alert.findFirst({ where: { kind: "TEST_ALERT" }, orderBy: { createdAt: "desc" } }),
    prisma.sourceHealth.findUnique({ where: { source: "EMAIL" } }),
    prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } }),
    prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } }),
    // The product: the newest strong matches, freshest finds first.
    prisma.match.findMany({
      where: { status: "strong_match", profile: { active: true }, listing: { isDuplicateOf: null } },
      include: { listing: true },
      orderBy: { listing: { createdAt: "desc" } },
      take: 3,
    }),
  ]);
  const twilio = twilioConfigVars();
  const email = emailConfigVars();

  // Configured ≠ verified: green only after a test alert actually SENT.
  const whatsappState: DotState = !twilio.configured
    ? "off"
    : latestTestAlert == null
      ? "stale"
      : latestTestAlert.status === "FAILED"
        ? "error"
        : "live";

  return (
    <div className="space-y-8">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">הדירה הבאה שלך</h1>
          <p className="mt-1 text-sm text-muted">
            סריקה אוטומטית של יד2, פייסבוק ואימייל כל ~5 דקות · וואטסאפ על התאמות חזקות
          </p>
        </div>
        <div className="flex gap-3">
          <form action={runScanAction}>
            <SubmitButton icon="search" pendingText="סורק…">
              סרוק עכשיו{pendingCount > 0 ? ` (${pendingCount})` : ""}
            </SubmitButton>
          </form>
          <form action={sendTestAlertAction}>
            <SubmitButton variant="secondary" icon="chat" pendingText="שולח…">
              התראת בדיקה
            </SubmitButton>
          </form>
        </div>
      </div>

      {searchParams.testAlert && (
        <div className="flex items-center gap-2 rounded-xl2 border border-line bg-good-soft px-4 py-3 text-sm text-good">
          <Icon name="bell" size={16} />
          התראת בדיקה נשלחה — בדוק את הוואטסאפ שלך ואת שורת הסטטוס למטה.
        </div>
      )}

      {/* THE PRODUCT: newest strong matches */}
      <section>
        <SectionTitle
          action={
            <Link href="/matches" className="text-sm text-accent underline-offset-2 hover:underline">
              כל ההתאמות ←
            </Link>
          }
        >
          נמצאו לאחרונה
        </SectionTitle>
        {heroMatches.length === 0 ? (
          <EmptyState icon="spark" title="אין עדיין התאמות חזקות">
            כשהסורקים ימצאו דירה שעונה על הפרופיל שלך היא תופיע כאן — ותקבל וואטסאפ.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {heroMatches.map((m) => {
              const l = m.listing;
              return (
                <Card key={m.id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="tnum font-display text-2xl font-bold">
                      {l.price != null ? price(l.price) : "מחיר לא צוין"}
                    </div>
                    <ScoreBadge score={m.score} size={44} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                    <Icon name="pin" size={13} />
                    {[l.city, l.neighborhood].filter(Boolean).join(", ") || "מיקום לא ידוע"}
                  </div>
                  <div className="tnum mt-1 text-sm text-muted">
                    {[
                      l.rooms != null ? `${l.rooms} חד׳` : null,
                      l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
                      l.dealType ? DEAL_HE[l.dealType] : null,
                      BROKER_HE[l.brokerStatus] === "לא ידוע" ? null : BROKER_HE[l.brokerStatus],
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-faint">
                    <Badge tone="neutral">{SOURCE_HE[l.source] ?? l.source}</Badge>
                    נמצאה {relTime(l.createdAt)}
                  </div>
                  <div className="mt-auto flex gap-2 pt-4">
                    {l.url && (
                      <ButtonLink href={l.url} external variant="primary" size="sm" icon="external" className="flex-1">
                        פתח מודעה
                      </ButtonLink>
                    )}
                    <ButtonLink href="/matches" variant="secondary" size="sm" className="flex-1">
                      פרטים מלאים
                    </ButtonLink>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Stat tiles — each links to its view */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile value={listingCount} label="דירות במערכת" icon="building" href="/matches" />
        <StatTile value={strongCount} label="התאמות חזקות" icon="spark" href="/matches?status=strong_match" />
        <StatTile value={profiles.length} label="פרופילי חיפוש" icon="search" href="/profiles/new" />
        <StatTile
          value={pendingCount}
          label="ממתינות לסריקה"
          icon="clock"
          hint={pendingCount > 0 ? "לחץ ״סרוק עכשיו״" : undefined}
        />
      </div>

      {/* System health — one slim strip */}
      <Card className="grid grid-cols-2 divide-line max-lg:divide-y lg:grid-cols-4 lg:divide-x lg:divide-x-reverse">
        <SourceCell title="יד2" icon="building" state={freshness(yad2Health)} when={relTime(yad2Health?.lastSuccessAt)} note={yad2Health?.lastError} />
        <SourceCell
          title="פייסבוק"
          icon="chat"
          state={freshness(fbHealth)}
          when={`${relTime(fbHealth?.lastSuccessAt)} · ${fbHealth?.lastItemsFound ?? 0} פוסטים`}
          note={fbHealth?.lastError}
        />
        <SourceCell
          title="אימייל"
          icon="envelope"
          state={email.configured ? freshness(emailHealth) : "off"}
          when={email.configured ? relTime(emailHealth?.lastSuccessAt) : "לא מוגדר"}
          note={emailHealth?.lastError}
        />
        <SourceCell
          title="וואטסאפ"
          icon="bell"
          state={whatsappState}
          when={
            !twilio.configured
              ? "לא מוגדר"
              : latestTestAlert == null
                ? "שלח התראת בדיקה לאימות"
                : latestTestAlert.status === "FAILED"
                  ? "הבדיקה נכשלה"
                  : `אומת ${relTime(latestTestAlert.sentAt ?? latestTestAlert.createdAt)}`
          }
          note={latestTestAlert?.error}
        />
      </Card>

      {/* Search profiles */}
      <section>
        <SectionTitle
          action={
            <ButtonLink href="/profiles/new" variant="secondary" size="sm" icon="plus">
              פרופיל חדש
            </ButtonLink>
          }
        >
          פרופילי חיפוש
        </SectionTitle>

        {profiles.length === 0 ? (
          <EmptyState
            icon="search"
            title="עדיין אין פרופיל חיפוש"
            action={
              <ButtonLink href="/profiles/new" variant="primary" icon="plus">
                צור פרופיל ראשון
              </ButtonLink>
            }
          >
            פרופיל מגדיר מה אתה מחפש — ערים, תקציב, חדרים — והמערכת מתריעה רק על מה שמתאים.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {profiles.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-lg font-semibold">{p.name}</span>
                      <Badge tone={p.dealType === "RENT" ? "accent" : "neutral"}>
                        {DEAL_HE[p.dealType] ?? p.dealType}
                      </Badge>
                      {!p.active && <Badge tone="neutral">לא פעיל</Badge>}
                    </div>
                    <div className="tnum mt-2 text-sm text-muted">
                      {p.cities} · {p.priceMin ? `${price(p.priceMin)}–` : "עד "}
                      {price(p.priceMax)}
                      {p.roomsMin ? ` · ${p.roomsMin}${p.roomsMax ? `–${p.roomsMax}` : "+"} חדרים` : ""}
                      {p.sizeMinSqm ? ` · ${p.sizeMinSqm}+ מ״ר` : ""}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      תיווך: <b className="text-ink">{BROKER_PREF_HE[p.brokerStatusPref] ?? p.brokerStatusPref}</b>
                    </div>
                    <div className="tnum mt-2 text-xs text-faint">
                      📱 וואטסאפ מציון {p.whatsappThreshold} ·{" "}
                      {p.priceDropReAlert ? "התראה חוזרת בירידת מחיר" : "התראה אחת בלבד"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/profiles/${p.id}`}
                      className="rounded-lg p-2 text-muted transition-colors hover:bg-card2 hover:text-ink"
                      title="עריכה"
                    >
                      <Icon name="pencil" size={16} />
                    </Link>
                    <form action={deleteProfile}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton
                        variant="danger"
                        size="sm"
                        icon="trash"
                        confirmText={`למחוק את הפרופיל "${p.name}"? הפעולה אינה הפיכה.`}
                        pendingText="מוחק…"
                      >
                        <span className="sr-only">מחיקה</span>
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

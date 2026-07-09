import Link from "next/link";
import { prisma } from "@/lib/db";
import { runScanAction, sendTestAlertAction, deleteProfile } from "./actions";
import { twilioConfigVars } from "@/core/alert";
import { emailConfigVars } from "@/core/connectors/email";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StatTile from "@/components/ui/StatTile";
import StatusDot, { type DotState } from "@/components/ui/StatusDot";
import EmptyState from "@/components/ui/EmptyState";
import Icon, { type IconName } from "@/components/ui/Icon";
import { BROKER_PREF_HE, DEAL_HE } from "@/lib/labels";
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

function SourceCard({
  title,
  icon,
  state,
  lastSuccessAt,
  lines,
  error,
}: {
  title: string;
  icon: IconName;
  state: DotState;
  lastSuccessAt?: Date | null;
  lines: string[];
  error?: string | null;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <span className="text-muted">
            <Icon name={icon} size={16} />
          </span>
          {title}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <StatusDot state={state} />
          {DOT_LABEL[state]}
        </div>
      </div>
      <div className="mt-2 text-xs text-muted">
        בדיקה אחרונה: <b>{relTime(lastSuccessAt)}</b>
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-faint">
        {lines.map((l, i) => (
          <div key={i} className="tnum">{l}</div>
        ))}
      </div>
      {error && (
        <div className="mt-2 rounded-lg bg-warn-soft px-2 py-1 text-xs text-warn">{error}</div>
      )}
    </Card>
  );
}

export default async function Home({ searchParams }: { searchParams: { testAlert?: string } }) {
  const [profiles, listingCount, matchCount, pendingCount, latestTestAlert, emailHealth, fbHealth, fbListingCount, yad2Health, yad2ListingCount] = await Promise.all([
    prisma.profile.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.listing.count(),
    prisma.match.count({ where: { status: { in: ["strong_match", "possible_match"] } } }),
    prisma.listing.count({ where: { scanned: false } }),
    prisma.alert.findFirst({ where: { kind: "TEST_ALERT" }, orderBy: { createdAt: "desc" } }),
    prisma.sourceHealth.findUnique({ where: { source: "EMAIL" } }),
    prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } }),
    prisma.listing.count({ where: { source: "FACEBOOK" } }),
    prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } }),
    prisma.listing.count({ where: { source: "YAD2" } }),
  ]);
  const twilio = twilioConfigVars();
  const email = emailConfigVars();

  const whatsappState: DotState = !twilio.configured
    ? "off"
    : latestTestAlert?.status === "FAILED"
      ? "error"
      : "live";

  return (
    <div className="space-y-8">
      {/* Header row: greeting + primary actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">הדירה הבאה שלך</h1>
          <p className="mt-1 text-sm text-muted">
            המערכת סורקת יד2, פייסבוק ואימייל כל ~5 דקות ושולחת וואטסאפ על התאמות חזקות.
          </p>
        </div>
        <div className="flex gap-3">
          <form action={runScanAction}>
            <Button icon="search">
              סרוק עכשיו{pendingCount > 0 ? ` (${pendingCount} ממתינות)` : ""}
            </Button>
          </form>
          <form action={sendTestAlertAction}>
            <Button variant="secondary" icon="chat">
              שלח התראת בדיקה
            </Button>
          </form>
        </div>
      </div>

      {searchParams.testAlert && (
        <div className="flex items-center gap-2 rounded-xl2 border border-line bg-accent-soft px-4 py-3 text-sm text-accent">
          <Icon name="bell" size={16} />
          התראת בדיקה נשלחה — בדוק את סטטוס הוואטסאפ בכרטיס למטה.
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile value={listingCount} label="דירות במערכת" icon="building" />
        <StatTile value={matchCount} label="התאמות חזקות ואפשריות" icon="spark" />
        <StatTile value={profiles.length} label="פרופילי חיפוש" icon="search" />
        <StatTile
          value={pendingCount}
          label="ממתינות לסריקה"
          icon="clock"
          hint={pendingCount > 0 ? "לחץ ״סרוק עכשיו״ לעיבוד" : undefined}
        />
      </div>

      {/* Source health */}
      <section>
        <SectionTitle>מקורות מידע</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SourceCard
            title="יד2"
            icon="building"
            state={freshness(yad2Health)}
            lastSuccessAt={yad2Health?.lastSuccessAt}
            lines={[
              `${yad2ListingCount} דירות מיד2 במערכת`,
              `${yad2Health?.totalIngested ?? 0} נקלטו סה״כ`,
            ]}
            error={yad2Health?.lastError}
          />
          <SourceCard
            title="פייסבוק"
            icon="chat"
            state={freshness(fbHealth)}
            lastSuccessAt={fbHealth?.lastSuccessAt}
            lines={[
              `${fbListingCount} דירות מפייסבוק במערכת`,
              `סריקה אחרונה: ${fbHealth?.lastItemsFound ?? 0} פוסטים → ${fbHealth?.lastNewListings ?? 0} חדשות`,
            ]}
            error={fbHealth?.lastError}
          />
          <SourceCard
            title="אימייל"
            icon="envelope"
            state={email.configured ? freshness(emailHealth) : "off"}
            lastSuccessAt={emailHealth?.lastSuccessAt}
            lines={
              email.configured
                ? [
                    `סריקה אחרונה: ${emailHealth?.lastItemsFound ?? 0} מיילים → ${emailHealth?.lastNewListings ?? 0} חדשות`,
                    `${emailHealth?.totalIngested ?? 0} נקלטו סה״כ`,
                  ]
                : [`לא מוגדר — חסר: ${email.missing.join(", ")}`]
            }
            error={emailHealth?.lastError}
          />
          <SourceCard
            title="וואטסאפ"
            icon="bell"
            state={whatsappState}
            lastSuccessAt={latestTestAlert?.sentAt ?? latestTestAlert?.createdAt}
            lines={
              twilio.configured
                ? [
                    latestTestAlert
                      ? `בדיקה אחרונה: ${latestTestAlert.status === "SENT" ? "נשלחה ✓" : "נכשלה ✗"} (${latestTestAlert.channel})`
                      : "טרם נשלחה התראת בדיקה",
                  ]
                : [`לא מוגדר — חסר: ${twilio.missing.join(", ")}`]
            }
            error={latestTestAlert?.error}
          />
        </div>
      </section>

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
                      {p.cities} · עד {price(p.priceMax)}
                      {p.roomsMin ? ` · ${p.roomsMin}+ חדרים` : ""}
                      {p.sizeMinSqm ? ` · ${p.sizeMinSqm}+ מ״ר` : ""}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      תיווך: <b className="text-ink">{BROKER_PREF_HE[p.brokerStatusPref] ?? p.brokerStatusPref}</b>
                    </div>
                    <div className="tnum mt-2 text-xs text-faint">
                      וואטסאפ מציון {p.whatsappThreshold} · דשבורד מציון {p.dashboardThreshold} ·{" "}
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
                      <button
                        className="rounded-lg p-2 text-muted transition-colors hover:bg-crit-soft hover:text-crit"
                        title="מחיקה"
                      >
                        <Icon name="trash" size={16} />
                      </button>
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

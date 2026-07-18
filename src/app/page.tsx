import Link from "next/link";
import { prisma } from "@/lib/db";
import { runScanAction, sendTestAlertAction, deleteProfile } from "./actions";
import { hebrewCity, hebrewizeCities, telegramConfigured, twilioConfigVars } from "@/core/alert";
import { emailConfigVars } from "@/core/connectors/email";
import { ButtonLink } from "@/components/ui/Button";
import SubmitButton from "@/components/ui/SubmitButton";
import Badge from "@/components/ui/Badge";
import ScoreBadge from "@/components/ui/ScoreBadge";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";
import PushToggle from "@/components/ui/PushToggle";
import FlashBanner from "@/components/ui/FlashBanner";
import LandingMark from "@/components/ui/LandingMark";
import Thumb from "@/components/ui/Thumb";
import { DEAL_HE, BROKER_HE, SOURCE_HE, USER_STATUS_HE } from "@/lib/labels";
import { price, relTime, minutesSince } from "@/lib/format";
import type { SourceHealth } from "@prisma/client";

export const dynamic = "force-dynamic";

// Watchers deliver every ~5 minutes; under 12 counts as live, under 6h stale.
type DotState = "live" | "stale" | "error" | "off";
function freshness(h: SourceHealth | null | undefined): DotState {
  if (!h) return "off";
  if (h.consecutiveErrors > 0) return "error";
  const mins = minutesSince(h.lastSuccessAt);
  if (mins == null) return "off";
  if (mins < 12) return "live";
  if (mins < 360) return "stale";
  return "off";
}
const DOT_LABEL: Record<DotState, string> = { live: "פעיל", stale: "לא עדכני", error: "שגיאה", off: "לא מחובר" };
const DOT_CLS: Record<DotState, string> = {
  live: "bg-good led-live",
  stale: "bg-warn",
  error: "bg-crit",
  off: "bg-faint",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "בוקר טוב, דוד 👋";
  if (h >= 12 && h < 17) return "צהריים טובים, דוד 👋";
  if (h >= 17 && h < 22) return "ערב טוב, דוד 👋";
  return "לילה טוב, דוד 🌙";
}

/** monday board row: colored side-strip, photo, title/price, facts, blocks + actions. */
function BoardRow({
  strip,
  title,
  priceText,
  sub,
  image,
  children,
}: {
  strip: string;
  title: string;
  priceText: string | null;
  sub: string;
  image?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-3 border-b border-line p-3 pe-4 ps-[18px] last:border-b-0">
      <span className={`absolute inset-y-0 start-0 w-[6px] ${strip}`} aria-hidden="true" />
      {image && (
        <Thumb src={image} alt="" className="h-[64px] w-[64px] flex-none rounded-badge border border-line object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 truncate text-[15px] font-bold">{title}</div>
          <div className="tnum figtree flex-none text-[17px] font-bold">
            {priceText ?? <span className="text-sm font-medium text-muted">מחיר לא צוין</span>}
          </div>
        </div>
        <div className="tnum mt-0.5 text-xs text-muted">{sub}</div>
        {children && <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}

function GroupHead({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <div className={`mb-2 flex items-baseline gap-2 px-0.5 text-[15px] font-bold ${color}`}>
      <span className="text-[10px]">▼</span>
      {label}
      <span className="text-xs font-medium text-muted">{count}</span>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: { testAlert?: string } }) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [profiles, pendingCount, latestTestAlert, emailHealth, fbHealth, yad2Health, todayMatches, listingsToday, heroMatches, reviewMatches, pursuits] =
    await Promise.all([
      prisma.profile.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.listing.count({ where: { scanned: false } }),
      prisma.alert.findFirst({ where: { kind: "TEST_ALERT" }, orderBy: { createdAt: "desc" } }),
      prisma.sourceHealth.findUnique({ where: { source: "EMAIL" } }),
      prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } }),
      prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } }),
      // today's distribution for the battery
      prisma.match.groupBy({
        by: ["status"],
        where: { profile: { active: true }, listing: { createdAt: { gte: dayStart }, isDuplicateOf: null } },
        _count: { _all: true },
      }),
      prisma.listing.count({ where: { createdAt: { gte: dayStart }, isDuplicateOf: null } }),
      // the product: newest strong matches David hasn't dismissed
      prisma.match.findMany({
        where: {
          status: "strong_match",
          profile: { active: true },
          listing: { isDuplicateOf: null, userStatus: { notIn: ["DISMISSED", "WON"] } },
        },
        include: { listing: true },
        orderBy: { listing: { createdAt: "desc" } },
        take: 3,
      }),
      // the 79s: near-misses waiting for a human verdict
      prisma.match.findMany({
        where: {
          status: "possible_match",
          alerted: false,
          profile: { active: true },
          listing: { isDuplicateOf: null, userStatus: "NEW" },
        },
        include: { listing: true },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 3,
      }),
      // the pursuit shelf: apartments David is actively chasing
      prisma.listing.findMany({
        where: { userStatus: { in: ["CONTACTED", "VIEWING"] } },
        include: { matches: { where: { profile: { active: true } }, orderBy: { score: "desc" }, take: 1 } },
        orderBy: [{ viewingAt: "asc" }, { createdAt: "desc" }],
        take: 5,
      }),
    ]);

  const twilio = twilioConfigVars();
  const email = emailConfigVars();
  const telegram = telegramConfigured();

  const count = (s: string) => todayMatches.find((m) => m.status === s)?._count._all ?? 0;
  const strongToday = count("strong_match");
  const reviewToday = count("possible_match");
  const otherToday = Math.max(0, listingsToday - strongToday - reviewToday);

  const sensors: { name: string; state: DotState; when: string; note?: string | null }[] = [
    { name: "יד2", state: freshness(yad2Health), when: relTime(yad2Health?.lastSuccessAt), note: yad2Health?.lastError },
    { name: "פייסבוק", state: freshness(fbHealth), when: relTime(fbHealth?.lastSuccessAt), note: fbHealth?.lastError },
    {
      name: "אימייל",
      state: email.configured ? freshness(emailHealth) : "off",
      when: email.configured ? relTime(emailHealth?.lastSuccessAt) : "לא מוגדר",
      note: emailHealth?.lastError,
    },
    {
      name: telegram ? "טלגרם" : "וואטסאפ",
      state: telegram
        ? latestTestAlert?.status === "FAILED"
          ? "error"
          : "live"
        : !twilio.configured
          ? "off"
          : latestTestAlert?.status === "FAILED"
            ? "error"
            : "stale",
      when: telegram ? "מחובר" : twilio.configured ? "מוגדר" : "לא מוגדר",
      note: latestTestAlert?.error,
    },
  ];
  const allLive = sensors.every((s) => s.state === "live");
  const sensorProblem = sensors.find((s) => s.state === "error" || s.state === "off");

  const rowSub = (l: (typeof heroMatches)[number]["listing"]) =>
    [
      l.rooms != null ? `${l.rooms} חד׳` : null,
      l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
      l.dealType ? DEAL_HE[l.dealType] : null,
      BROKER_HE[l.brokerStatus] === "לא ידוע" ? null : BROKER_HE[l.brokerStatus],
      SOURCE_HE[l.source] ?? l.source,
      relTime(l.createdAt),
    ]
      .filter(Boolean)
      .join(" · ");

  const rowTitle = (l: (typeof heroMatches)[number]["listing"]) =>
    [hebrewCity(l.city), l.neighborhood ?? l.street].filter(Boolean).join(" · ") || "מיקום לא ידוע";

  // one line of WHY — a naked score is an assertion, a reason is an argument
  const topReason = (json: string): string | null => {
    try {
      const arr = JSON.parse(json);
      return Array.isArray(arr) && typeof arr[0] === "string" ? hebrewizeCities(arr[0]) : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* ===== HERO — the approved centered brand lockup on a monday gradient ===== */}
      <section className="hero-grad -mx-4 -mt-5 px-4 pb-8 pt-7 text-center sm:-mx-6 sm:-mt-8 sm:rounded-b-2xl">
        <div className="sm:hidden">
          {/* Tailwind preflight makes svg display:block — center it explicitly */}
          <div className="flex justify-center">
            <LandingMark size={54} />
          </div>
          <div className="figtree mt-2.5 text-[38px] font-bold leading-none tracking-tight" dir="ltr">
            Boton
          </div>
          <div className="mt-1.5 text-[14.5px] font-semibold text-[#50536b]">בוט אמריקאי מבית ביטון</div>
          <div className="mx-auto mt-4 w-full border-t border-[rgba(103,104,121,0.14)]" />
        </div>
        <div className="mt-4 sm:mt-0">
          <h1 className="text-[21px] font-bold">{greeting()}</h1>
          <p className="mt-1 text-[13.5px] text-[#50536b]">
            {listingsToday > 0 ? `הבוט סרק ${listingsToday} מודעות היום` : "הבוט סורק כל 5 דקות"} ·{" "}
            {allLive ? "כל החיישנים מחוברים" : sensorProblem ? `בעיה בחיישן ${sensorProblem.name}` : "חיישן אחד לא עדכני"}
          </p>
        </div>
      </section>

      {searchParams.testAlert &&
        (searchParams.testAlert === "failed" ? (
          <FlashBanner clear={["testAlert"]} autoHideMs={0}>
            <div className="rounded-xl2 border border-line bg-crit-soft px-4 py-3 text-sm text-crit">
              <span className="flex items-center gap-2 font-semibold">
                <Icon name="x" size={16} />
                התראת הבדיקה נכשלה — ההודעה לא הגיעה לנייד.
              </span>
              {latestTestAlert?.error && <div className="mt-1 text-xs">{latestTestAlert.error}</div>}
            </div>
          </FlashBanner>
        ) : (
          <FlashBanner clear={["testAlert"]}>
            <div className="flex items-center gap-2 rounded-xl2 border border-line bg-good-soft px-4 py-3 text-sm font-semibold text-[#00854d]">
              <Icon name="bell" size={16} />
              התראת בדיקה נשלחה — בדוק את הטלגרם שלך.
            </div>
          </FlashBanner>
        ))}

      {/* ===== THE BATTERY — today's distribution, the monday signature ===== */}
      <section className="-mt-10 rounded-xl2 border border-line bg-card p-4 shadow-lift">
        <h3 className="mb-2.5 text-[13px] font-semibold text-muted">
          הסריקה של היום · <b className="tnum text-ink">{listingsToday} מודעות</b>
        </h3>
        <div className="flex h-[22px] overflow-hidden rounded-badge">
          {strongToday > 0 && <i style={{ flex: strongToday }} className="bg-good" />}
          {reviewToday > 0 && <i style={{ flex: reviewToday }} className="bg-warn" />}
          <i style={{ flex: Math.max(otherToday, listingsToday === 0 ? 1 : 0) || 0.0001 }} className="bg-line" />
        </div>
        <div className="tnum mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <Link href="/matches?status=strong_match" className="inline-flex items-center gap-1.5 hover:text-ink">
            <i className="h-[9px] w-[9px] rounded-[3px] bg-good" />
            {strongToday} חזקות
          </Link>
          <Link href="/matches?status=possible_match" className="inline-flex items-center gap-1.5 hover:text-ink">
            <i className="h-[9px] w-[9px] rounded-[3px] bg-warn" />
            {reviewToday} לבדיקה
          </Link>
          <span className="inline-flex items-center gap-1.5">
            <i className="h-[9px] w-[9px] rounded-[3px] border border-linestrong bg-line" />
            {otherToday} לא רלוונטי
          </span>
        </div>
      </section>

      {/* ===== GROUP: the pursuit shelf — hope lives highest ===== */}
      {pursuits.length > 0 && (
        <section>
          <GroupHead color="text-special" label="בטיפול" count={pursuits.length} />
          <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
            {pursuits.map((l) => (
              <BoardRow
                key={l.id}
                strip="bg-special"
                  image={l.imageUrl}
                title={rowTitle(l)}
                priceText={l.price != null ? price(l.price) : null}
                sub={[
                  USER_STATUS_HE[l.userStatus],
                  l.viewingAt
                    ? `סיור ${l.viewingAt.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })} ${l.viewingAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
                    : null,
                  l.userNote,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              >
                {l.matches[0] && <ScoreBadge score={l.matches[0].score} />}
                <span className="ms-auto flex gap-2">
                  {l.phone && (
                    <a
                      href={`tel:${l.phone}`}
                      className="inline-flex items-center justify-center rounded-badge border border-accent bg-card px-3 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-accent-soft active:scale-[0.98]"
                    >
                      📞 חייג
                    </a>
                  )}
                  <ButtonLink href={`/listing/${l.id}`} variant="secondary" size="sm">
                    דף דירה
                  </ButtonLink>
                </span>
              </BoardRow>
            ))}
          </div>
        </section>
      )}

      {/* ===== GROUP: strong matches ===== */}
      <section>
        <GroupHead color="text-accent" label="התאמות חזקות" count={heroMatches.length} />
        {heroMatches.length === 0 ? (
          <EmptyState icon="spark" title="אין עדיין התאמות חזקות">
            כשהסורקים ימצאו דירה שעונה על הפרופיל שלך היא תופיע כאן — ותקבל התראה לנייד.
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
            {heroMatches.map((m) => {
              const l = m.listing;
              return (
                <BoardRow
                  key={m.id}
                  strip="bg-accent"
                  image={l.imageUrl}
                  title={rowTitle(l)}
                  priceText={l.price != null ? price(l.price) : null}
                  sub={rowSub(l)}
                >
                  <ScoreBadge score={m.score} />
                  {topReason(m.reasonsPositive) && (
                    <span className="max-w-[40%] truncate text-xs font-medium text-[#00854d]">✓ {topReason(m.reasonsPositive)}</span>
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
                    <ButtonLink href={`/listing/${l.id}`} variant="secondary" size="sm">
                      דף דירה
                    </ButtonLink>
                    {l.url && (
                      <ButtonLink href={l.url} external variant="primary" size="sm" icon="external">
                        פתח מודעה
                      </ButtonLink>
                    )}
                  </span>
                </BoardRow>
              );
            })}
          </div>
        )}
        <div className="mt-2 text-start">
          <Link href="/matches" className="text-sm font-semibold text-accent hover:underline">
            כל ההתאמות ←
          </Link>
        </div>
      </section>

      {/* ===== GROUP: review queue ===== */}
      {reviewMatches.length > 0 && (
        <section>
          <GroupHead color="text-warn" label="לבדיקה" count={reviewMatches.length} />
          <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
            {reviewMatches.map((m) => {
              const l = m.listing;
              return (
                <BoardRow
                  key={m.id}
                  strip="bg-warn"
                  image={l.imageUrl}
                  title={rowTitle(l)}
                  priceText={l.price != null ? price(l.price) : null}
                  sub={rowSub(l)}
                >
                  <ScoreBadge score={m.score} />
                  <Badge tone="neutral">ממתינה להחלטה</Badge>
                  <span className="ms-auto">
                    <ButtonLink href={`/listing/${l.id}`} variant="ghost" size="sm">
                      רלוונטי?
                    </ButtonLink>
                  </span>
                </BoardRow>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== sensors as chips ===== */}
      <section className="flex flex-wrap gap-2">
        {sensors.map((s) => (
          <span
            key={s.name}
            title={s.note ?? undefined}
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-muted shadow-card"
          >
            <i className={`h-2 w-2 rounded-full ${DOT_CLS[s.state]}`} />
            {s.name}
            <span className="font-normal text-faint">
              {DOT_LABEL[s.state]}
              {s.state === "live" && s.when !== "מחובר" ? ` · ${s.when}` : ""}
            </span>
          </span>
        ))}
      </section>
      {sensorProblem?.note && (
        <div className="rounded-xl2 border border-line bg-crit-soft px-4 py-2.5 text-xs text-crit">
          {sensorProblem.name}: {sensorProblem.note}
        </div>
      )}

      {/* ===== ops row ===== */}
      <section className="flex flex-wrap items-center gap-2.5">
        <form action={runScanAction}>
          <SubmitButton
            variant="secondary"
            size="sm"
            icon="search"
            pendingText="בודק…"
            title="יד2 ופייסבוק נסרקים אוטומטית מהדפדפן — הכפתור בודק אימייל ומודעות ממתינות"
          >
            בדוק אימייל וממתינות{pendingCount > 0 ? ` (${pendingCount})` : ""}
          </SubmitButton>
        </form>
        <form action={sendTestAlertAction}>
          <SubmitButton variant="secondary" size="sm" icon="chat" pendingText="שולח…">
            התראת בדיקה
          </SubmitButton>
        </form>
        <PushToggle />
      </section>

      {/* ===== profiles ===== */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <GroupHead color="text-special" label="פרופילי חיפוש" count={profiles.length} />
          <ButtonLink href="/profiles/new" variant="secondary" size="sm" icon="plus">
            פרופיל חדש
          </ButtonLink>
        </div>
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
          <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
            {profiles.map((p) => (
              <div key={p.id} className="relative border-b border-line p-3 pe-4 ps-[18px] last:border-b-0">
                <span className="absolute inset-y-0 start-0 w-[6px] bg-special" aria-hidden="true" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-bold">{p.name}</span>
                      <Badge tone={p.dealType === "RENT" ? "accent" : "neutral"}>{DEAL_HE[p.dealType] ?? p.dealType}</Badge>
                      {!p.active && <Badge tone="neutral">לא פעיל</Badge>}
                    </div>
                    <div className="tnum mt-1 text-xs text-muted">
                      {p.cities} · {p.priceMin ? `${price(p.priceMin)}–` : "עד "}
                      {price(p.priceMax)}
                      {p.roomsMin ? ` · ${p.roomsMin}${p.roomsMax ? `–${p.roomsMax}` : "+"} חדרים` : ""}
                    </div>
                    <div className="tnum mt-0.5 text-xs text-faint">
                      התראה לנייד מציון {p.whatsappThreshold} · {p.priceDropReAlert ? "התראה חוזרת בירידת מחיר" : "התראה אחת בלבד"}
                    </div>
                  </div>
                  {/* 44px targets, separated — one of these is irreversible */}
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={`/profiles/${p.id}`}
                      className="grid h-11 w-11 place-items-center rounded-badge text-muted transition-colors hover:bg-card2 hover:text-ink"
                      title="עריכה"
                    >
                      <Icon name="pencil" size={18} />
                    </Link>
                    <form action={deleteProfile}>
                      <input type="hidden" name="id" value={p.id} />
                      <SubmitButton
                        variant="danger"
                        size="sm"
                        icon="trash"
                        className="min-h-[44px]"
                        confirmText={`למחוק את הפרופיל "${p.name}"? הפעולה אינה הפיכה.`}
                        pendingText="מוחק…"
                      >
                        <span className="sr-only">מחיקה</span>
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

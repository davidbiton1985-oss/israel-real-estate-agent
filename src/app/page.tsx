import Link from "next/link";
import { prisma } from "@/lib/db";
import { hebrewCity, telegramConfigured } from "@/core/alert";
import { emailConfigVars } from "@/core/connectors/email";
import ScoreBadge from "@/components/ui/ScoreBadge";
import FlashBanner from "@/components/ui/FlashBanner";
import BotonMark from "@/components/ui/BotonMark";
import Thumb from "@/components/ui/Thumb";
import SourceMark from "@/components/ui/SourceMark";
import PhotoPlaceholder from "@/components/ui/PhotoPlaceholder";
import { DEAL_HE, BROKER_HE, SOURCE_HE, USER_STATUS_HE } from "@/lib/labels";
import Price from "@/components/ui/Price";
import { relTime, minutesSince } from "@/lib/format";
import type { Listing, SourceHealth } from "@prisma/client";

export const dynamic = "force-dynamic";

type DotState = "live" | "stale" | "off";
function freshness(h: SourceHealth | null | undefined): DotState {
  if (!h?.lastSuccessAt) return "off";
  const mins = minutesSince(h.lastSuccessAt);
  if (mins == null) return "off";
  if (mins < 12 && h.consecutiveErrors === 0) return "live";
  if (mins < 360) return "stale";
  return "off";
}

function greetWord(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 22) return "ערב טוב";
  return "לילה טוב";
}

function factsLine(l: Listing): string {
  return [
    l.rooms != null ? `${l.rooms} חד׳` : null,
    l.sizeSqm != null ? `${l.sizeSqm} מ״ר` : null,
    l.floor != null ? `קומה ${l.floor}` : null,
    l.dealType ? DEAL_HE[l.dealType] : null,
    BROKER_HE[l.brokerStatus] === "לא ידוע" ? null : BROKER_HE[l.brokerStatus],
  ]
    .filter(Boolean)
    .join(" · ");
}
function titleLine(l: Listing): string {
  return [hebrewCity(l.city), l.neighborhood ?? l.street].filter(Boolean).join(" · ") || "מיקום לא ידוע";
}

/** A gallery piece: photo (or the quiet house placeholder) with the glass
 * placard, then the label block — every card keeps the same shape. */
function Piece({
  listing,
  score,
  when,
  placardText,
}: {
  listing: Listing;
  score?: number | null;
  when?: string;
  placardText?: string;
}) {
  const placard = placardText ?? (listing.price != null ? <Price value={listing.price} /> : null);
  return (
    <div className="rise relative overflow-hidden rounded-xl2 bg-card shadow-card">
      <Link href={`/listing/${listing.id}`} className="absolute inset-0 z-[1]" aria-label={titleLine(listing)} />
      <div className="relative aspect-[16/9] bg-card2">
        {listing.imageUrl ? (
          <Thumb src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <PhotoPlaceholder />
        )}
        {placard && (
          <div className="placard">
            <span className="display tnum text-[21px] leading-none">{placard}</span>
          </div>
        )}
      </div>
      <div className="px-4 py-4">
        <div className="text-[19px] font-bold leading-snug">{titleLine(listing)}</div>
        <div className="tnum mt-1 text-[15px] text-muted">{factsLine(listing)}</div>
        <div className="mt-3 flex items-center gap-2">
          {score != null && <ScoreBadge score={score} />}
          <span className="ms-auto inline-flex items-center gap-1.5 text-[13px] text-muted">
            {!listing.url && <SourceMark source={listing.source} size={15} />}
            {when}
          </span>
          {listing.url && (
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-[2] inline-flex min-h-[34px] items-center gap-1.5 rounded-full bg-card2 px-3.5 text-[12.5px] font-bold text-ink transition-all active:scale-95"
            >
              <SourceMark source={listing.source} size={15} />
              למודעה ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams: { testAlert?: string } }) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [latestTestAlert, emailHealth, fbHealth, yad2Health, listingsToday, strongTodayCount, heroMatches, reviewMatches, pursuits] =
    await Promise.all([
      prisma.alert.findFirst({ where: { kind: "TEST_ALERT" }, orderBy: { createdAt: "desc" } }),
      prisma.sourceHealth.findUnique({ where: { source: "EMAIL" } }),
      prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } }),
      prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } }),
      prisma.listing.count({ where: { createdAt: { gte: dayStart }, isDuplicateOf: null } }),
      prisma.match.count({
        where: {
          status: "strong_match",
          profile: { active: true },
          listing: { createdAt: { gte: dayStart }, isDuplicateOf: null, userStatus: { notIn: ["DISMISSED", "WON"] } },
        },
      }),
      prisma.match.findMany({
        where: {
          status: "strong_match",
          profile: { active: true },
          listing: { isDuplicateOf: null, userStatus: { notIn: ["DISMISSED", "WON"] } },
        },
        include: { listing: true },
        orderBy: { listing: { createdAt: "desc" } },
        take: 4,
      }),
      prisma.match.findMany({
        where: {
          status: "possible_match",
          alerted: false,
          profile: { active: true },
          listing: { isDuplicateOf: null, userStatus: "NEW" },
        },
        include: { listing: true },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        take: 2,
      }),
      prisma.listing.findMany({
        where: { userStatus: { in: ["CONTACTED", "VIEWING"] } },
        include: { matches: { where: { profile: { active: true } }, orderBy: { score: "desc" }, take: 1 } },
        orderBy: [{ viewingAt: "asc" }, { createdAt: "desc" }],
        take: 3,
      }),
    ]);

  const email = emailConfigVars();
  const sensors: DotState[] = [
    freshness(yad2Health),
    freshness(fbHealth),
    email.configured ? freshness(emailHealth) : "off",
    telegramConfigured() ? (latestTestAlert?.status === "FAILED" ? "off" : "live") : "off",
  ];
  const problem = sensors.some((s) => s !== "live");

  const greeting =
    strongTodayCount > 0
      ? `${greetWord()} דוד — ${strongTodayCount === 1 ? "דירה חדשה אחת מחכה לך" : `${strongTodayCount} דירות חדשות מחכות לך`} היום.`
      : listingsToday > 0
        ? `${greetWord()} דוד — ${listingsToday} מודעות נסרקו היום, אף אחת לא עברה את הרף.`
        : `${greetWord()} דוד — שקט בינתיים, הבוט סורק כל 5 דקות.`;

  return (
    <div>
      {/* masthead — the "placard": a warm porcelain band, ink monogram tile
          next to the wordmark, set apart from the porcelain feed below */}
      <div
        className="-mx-[10px] -mt-2 flex items-center justify-center gap-4 px-6 pb-6 pt-8"
        style={{
          background: "linear-gradient(178deg,#f5f3ec 0%,#e9e6dd 100%)",
          borderBottom: "1px solid rgba(21,24,26,.07)",
          direction: "ltr",
        }}
      >
        <BotonMark size={58} />
        <div className="text-left">
          <div className="display text-[34px] leading-none" dir="ltr">
            Boton
          </div>
          <div className="mt-1.5 text-[12.5px] font-semibold text-muted" dir="rtl" style={{ letterSpacing: ".04em" }}>
            בוט אמריקאי מבית ביטון
          </div>
        </div>
      </div>

      {/* greeting */}
      <p className="mt-6 px-0.5 text-[15px] leading-relaxed text-muted">
        {greeting.split("—")[0]}—<b className="font-bold text-ink">{greeting.split("—")[1]}</b>
      </p>
      {problem && (
        <Link href="/profile" className="mt-2 block px-0.5 text-[12.5px] font-semibold text-warn">
          אחד החיישנים לא מעודכן — לפרטים ←
        </Link>
      )}

      {searchParams.testAlert && (
        <FlashBanner clear={["testAlert"]}>
          <div className="mt-3 rounded-xl2 bg-card p-3.5 text-sm font-semibold shadow-card">
            {searchParams.testAlert === "failed" ? (
              <span className="text-crit">✗ התראת הבדיקה נכשלה — ההודעה לא הגיעה לנייד.</span>
            ) : (
              <span className="text-accent">✓ התראת בדיקה נשלחה — בדוק את הטלגרם.</span>
            )}
          </div>
        </FlashBanner>
      )}

      {/* the gallery */}
      {heroMatches.length > 0 && (
        <>
          <div className="whisper mt-7 px-1">דירות חדשות שמתאימות לך</div>
          <div className="mt-3 space-y-[18px]">
            {heroMatches.map((m) => (
              <Piece key={m.id} listing={m.listing} score={m.score} when={relTime(m.listing.createdAt)} />
            ))}
          </div>
        </>
      )}

      {reviewMatches.length > 0 && (
        <>
          <div className="whisper mt-7 px-1">לבדיקה</div>
          <div className="mt-3 space-y-[18px]">
            {reviewMatches.map((m) => (
              <Piece key={m.id} listing={m.listing} score={m.score} when={relTime(m.listing.createdAt)} />
            ))}
          </div>
        </>
      )}

      {pursuits.length > 0 && (
        <>
          <div className="whisper mt-7 px-1">בטיפול</div>
          <div className="mt-3 space-y-[18px]">
            {pursuits.map((l) => (
              <Piece
                key={l.id}
                listing={l}
                score={l.matches[0]?.score}
                when={USER_STATUS_HE[l.userStatus]}
                placardText={
                  l.viewingAt
                    ? `סיור · ${l.viewingAt.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })} ${l.viewingAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}

      {heroMatches.length === 0 && reviewMatches.length === 0 && (
        <div className="mt-10 rounded-xl2 bg-card p-8 text-center shadow-card">
          <div className="text-3xl">🏠</div>
          <div className="mt-2 text-[16px] font-bold">אין התאמות חדשות כרגע</div>
          <p className="mx-auto mt-1 max-w-[260px] text-sm leading-relaxed text-muted">
            כשהבוט ימצא דירה שמתאימה לפרופיל שלך היא תופיע כאן — ותקבל התראה לנייד.
          </p>
        </div>
      )}

      <div className="mt-7 text-center">
        <Link href="/matches" className="text-sm font-bold text-accent">
          לכל ההתאמות ←
        </Link>
      </div>
    </div>
  );
}

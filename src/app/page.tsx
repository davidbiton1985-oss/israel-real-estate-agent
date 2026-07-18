import Link from "next/link";
import { prisma } from "@/lib/db";
import { hebrewCity, telegramConfigured } from "@/core/alert";
import { emailConfigVars } from "@/core/connectors/email";
import ScoreBadge from "@/components/ui/ScoreBadge";
import FlashBanner from "@/components/ui/FlashBanner";
import LandingMark from "@/components/ui/LandingMark";
import Thumb from "@/components/ui/Thumb";
import { DEAL_HE, BROKER_HE, SOURCE_HE, USER_STATUS_HE } from "@/lib/labels";
import { price, relTime, minutesSince } from "@/lib/format";
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
const DOT_CLS: Record<DotState, string> = { live: "bg-accent", stale: "bg-warn", off: "bg-faint" };

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

/** A gallery piece: photo with the glass placard, then the label block.
 * Photo-less listings hang as quiet text cards — the placard only ever sits
 * on truth. */
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
  const placard = placardText ?? (listing.price != null ? `${price(listing.price)}` : null);
  return (
    <Link href={`/listing/${listing.id}`} className="rise block overflow-hidden rounded-xl2 bg-card shadow-card">
      {listing.imageUrl ? (
        <div className="relative aspect-[16/10] bg-card2">
          <Thumb src={listing.imageUrl} alt="" className="h-full w-full object-cover" />
          {placard && (
            <div className="placard">
              <span className="display tnum text-[20px] leading-none">{placard}</span>
            </div>
          )}
        </div>
      ) : null}
      <div className="p-4">
        {!listing.imageUrl && placard && (
          <div className="display tnum mb-0.5 text-[22px] leading-none">{placard}</div>
        )}
        <div className="text-[16.5px] font-bold">{titleLine(listing)}</div>
        <div className="tnum mt-0.5 text-[13px] text-muted">{factsLine(listing)}</div>
        <div className="mt-2.5 flex items-baseline gap-2">
          {score != null && <ScoreBadge score={score} />}
          <span className="ms-auto text-[11.5px] text-muted">
            {SOURCE_HE[listing.source] ?? listing.source}
            {when ? ` · ${when}` : ""}
          </span>
        </div>
      </div>
    </Link>
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
      ? `${greetWord()} דוד — היום נתלו ${strongTodayCount === 1 ? "עבודה חדשה אחת" : `${strongTodayCount} עבודות חדשות`} בגלריה.`
      : listingsToday > 0
        ? `${greetWord()} דוד — ${listingsToday} מודעות נסרקו היום, אין חדשות שעברו את הרף.`
        : `${greetWord()} דוד — שקט בינתיים, הבוט סורק כל 5 דקות.`;

  return (
    <div>
      {/* top row */}
      <div className="flex items-center gap-2.5 pt-3">
        <LandingMark size={26} />
        <div>
          <div className="display text-[20px] leading-none" dir="ltr">
            Boton
          </div>
          <div className="mt-0.5 text-[11px] text-muted">בוט אמריקאי מבית ביטון</div>
        </div>
        <Link
          href="/profile"
          title="מצב החיישנים — לפירוט בפרופיל"
          className="ms-auto flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2.5 shadow-card"
        >
          {sensors.map((s, i) => (
            <i key={i} className={`h-1.5 w-1.5 rounded-full ${DOT_CLS[s]} ${s === "live" && i === 0 ? "led-live" : ""}`} />
          ))}
        </Link>
      </div>

      {/* greeting */}
      <p className="mt-5 px-0.5 text-[15px] leading-relaxed text-muted">
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
          <div className="whisper mt-7 px-1">חדשות</div>
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
          <div className="text-3xl">🖼️</div>
          <div className="mt-2 text-[16px] font-bold">הגלריה ריקה כרגע</div>
          <p className="mx-auto mt-1 max-w-[260px] text-sm leading-relaxed text-muted">
            כשהבוט ימצא דירה שעונה על הפרופיל שלך היא תיתלה כאן — ותקבל התראה לנייד.
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

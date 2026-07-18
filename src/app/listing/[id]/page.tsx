import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { setListingStatus, savePursuit } from "@/app/actions";
import { hebrewCity, hebrewizeCities } from "@/core/alert";
import SubmitButton from "@/components/ui/SubmitButton";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Thumb from "@/components/ui/Thumb";
import SourceMark from "@/components/ui/SourceMark";
import Price from "@/components/ui/Price";
import { Input, Textarea } from "@/components/ui/Field";
import { DEAL_HE, BROKER_HE, SOURCE_HE } from "@/lib/labels";
import { relTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "דף דירה" };

function parseArr(s: string | null | undefined): string[] {
  try {
    const v = JSON.parse(s ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** The gallery's viewing room: one apartment, full attention. Photo bleeds
 * behind a rounded sheet; the placard carries the price; the call is a
 * sticky green pill under the thumb. */
export default async function ListingPage({ params }: { params: { id: string } }) {
  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    include: {
      matches: { where: { profile: { active: true } }, orderBy: { score: "desc" }, include: { profile: true } },
    },
  });
  if (!listing) notFound();
  const match = listing.matches[0] ?? null;

  const pos = parseArr(match?.reasonsPositive).map(hebrewizeCities);
  const neg = parseArr(match?.reasonsNegative).map(hebrewizeCities);
  const missing = parseArr(match?.missingFields).map(hebrewizeCities);
  const flags = parseArr(match?.redFlags).map(hebrewizeCities);

  const title = [hebrewCity(listing.city), listing.neighborhood, listing.street].filter(Boolean).join(" · ") || "מיקום לא ידוע";
  const facts = [
    listing.rooms != null ? `${listing.rooms} חד׳` : null,
    listing.sizeSqm != null ? `${listing.sizeSqm} מ״ר` : null,
    listing.floor != null ? `קומה ${listing.floor}` : null,
    listing.dealType ? DEAL_HE[listing.dealType] : null,
    BROKER_HE[listing.brokerStatus] === "לא ידוע" ? null : BROKER_HE[listing.brokerStatus],
    SOURCE_HE[listing.source] ?? listing.source,
    `נמצאה ${relTime(listing.createdAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const waDigits = listing.phone?.replace(/\D/g, "");

  const TRIAGE = [
    { status: "CONTACTED", label: "התקשרתי" },
    { status: "VIEWING", label: "נקבע סיור" },
    { status: "DISMISSED", label: "לא רלוונטי" },
    { status: "WON", label: "חתמתי!" },
  ];

  return (
    <div className="pb-24">
      {/* hero photo, full bleed */}
      <div className="relative -mx-[10px] -mt-2 sm:mx-0 sm:mt-0 sm:overflow-hidden sm:rounded-xl2">
        {listing.imageUrl ? (
          <div className="relative aspect-[4/3] bg-card2">
            <Thumb src={listing.imageUrl} alt="תמונת הדירה" className="h-full w-full object-cover" />
            {listing.price != null && (
              <div className="placard" style={{ bottom: 42 }}>
                <span className="display tnum text-[20px] leading-none"><Price value={listing.price} /></span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-16" />
        )}
        <Link
          href="/"
          className="absolute top-4 me-4 ms-4 inline-flex items-center rounded-full px-4 py-2.5 text-[13.5px] font-bold shadow-card backdrop-blur"
          style={{ insetInlineStart: 0, background: "var(--glass)" }}
        >
          → דף הבית
        </Link>
      </div>

      {/* the sheet */}
      <div className={`relative -mx-[10px] rounded-t-sheet bg-bg px-[14px] pt-6 sm:mx-0 ${listing.imageUrl ? "-mt-6" : ""}`}>
        {!listing.imageUrl && (
          <div className="display tnum mb-1 text-[26px] leading-none">
            {listing.price != null ? <Price value={listing.price} /> : <span className="font-body text-base font-semibold text-muted">מחיר לא צוין</span>}
          </div>
        )}
        <h1 className="text-[21px] font-bold leading-snug">{title}</h1>
        <div className="tnum mt-1 text-[13.5px] text-muted">{facts}</div>
        {match && (
          <div className="mt-3">
            <ScoreBadge score={match.score} size={44} />
          </div>
        )}

        {/* verdict chips */}
        <div className="scrollbar-none -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {TRIAGE.map((t) => (
            <form key={t.status} action={setListingStatus} className="flex-none">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="status" value={t.status} />
              <SubmitButton
                variant="secondary"
                size="sm"
                className={listing.userStatus === t.status ? "!bg-accent !text-white" : ""}
                pendingText="…"
                title={listing.userStatus === t.status ? "לחיצה נוספת מבטלת" : undefined}
              >
                {t.label}
              </SubmitButton>
            </form>
          ))}
        </div>

        {missing.length > 0 && (
          <>
            <div className="whisper mt-7 px-1">לוודא בשיחה</div>
            <div className="mt-2">
              {missing.map((f) => (
                <div key={f} className="flex items-center gap-2.5 px-1 py-2 text-[14.5px]">
                  <span className="h-[17px] w-[17px] flex-none rounded-[5px] border-2 border-accent" aria-hidden="true" />
                  {f}
                </div>
              ))}
            </div>
          </>
        )}

        {(pos.length > 0 || neg.length > 0 || flags.length > 0) && (
          <>
            <div className="whisper mt-6 px-1">למה זה מתאים</div>
            <div className="mt-2">
              {pos.map((r) => (
                <div key={`p${r}`} className="flex gap-2.5 px-1 py-1.5 text-[14px]">
                  <span className="w-4 flex-none text-center text-accent">✓</span>
                  {r}
                </div>
              ))}
              {neg.map((r) => (
                <div key={`n${r}`} className="flex gap-2.5 px-1 py-1.5 text-[14px]">
                  <span className="w-4 flex-none text-center text-crit">✗</span>
                  {r}
                </div>
              ))}
              {flags.map((r) => (
                <div key={`f${r}`} className="flex gap-2.5 px-1 py-1.5 text-[14px]">
                  <span className="w-4 flex-none text-center">🚩</span>
                  {r}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="whisper mt-6 px-1">מעקב</div>
        <form action={savePursuit} className="mt-2 space-y-3 rounded-xl2 bg-card p-4 shadow-card">
          <input type="hidden" name="listingId" value={listing.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-bold">סיור</span>
              <div className="mt-1">
                <Input
                  type="datetime-local"
                  name="viewingAt"
                  defaultValue={
                    listing.viewingAt
                      ? new Date(listing.viewingAt.getTime() - listing.viewingAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
                      : ""
                  }
                />
              </div>
            </label>
            <label className="block text-sm">
              <span className="font-bold">הערה</span>
              <div className="mt-1">
                <Textarea name="userNote" rows={1} defaultValue={listing.userNote ?? ""} placeholder="למשל: לחזור אחרי 18:00" />
              </div>
            </label>
          </div>
          <SubmitButton variant="secondary" size="sm" pendingText="שומר…">
            שמור מעקב
          </SubmitButton>
        </form>

        <div className="whisper mt-6 px-1">הפוסט המקורי · {SOURCE_HE[listing.source] ?? listing.source}</div>
        <pre dir="auto" className="mt-2 whitespace-pre-wrap rounded-xl2 bg-card p-4 text-[13.5px] leading-[1.7] shadow-card">
          {listing.rawText}
        </pre>
      </div>

      {/* sticky action bar — the dock steps aside on this page */}
      <div
        className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-[430px] -translate-x-1/2 items-center gap-2.5 px-[10px] sm:max-w-lg"
        style={{
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          paddingTop: 12,
          background: "linear-gradient(0deg, var(--bg) 70%, transparent)",
        }}
      >
        {listing.phone ? (
          <>
            <a
              href={`tel:${listing.phone}`}
              className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[16px] font-bold text-white transition-all hover:bg-accent-strong active:scale-[0.97]"
            >
              <span className="tnum" dir="ltr">📞 {listing.phone}</span>
            </a>
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              title="וואטסאפ למפרסם"
              className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-card text-[19px] shadow-card active:scale-95"
            >
              💬
            </a>
            {listing.url && (
              <a
                href={listing.url}
                target="_blank"
                rel="noopener noreferrer"
                title="המודעה המקורית"
                className="inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-card shadow-card active:scale-95"
              >
                <SourceMark source={listing.source} size={22} />
              </a>
            )}
          </>
        ) : listing.url ? (
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-white active:scale-[0.97]"
          >
            <SourceMark source={listing.source} size={18} />
            פתח מודעה — הטלפון בפוסט המקורי
          </a>
        ) : (
          <div className="flex-1 py-3 text-center text-xs text-muted">אין טלפון או קישור למודעה — הפרטים בפוסט למעלה</div>
        )}
      </div>
    </div>
  );
}

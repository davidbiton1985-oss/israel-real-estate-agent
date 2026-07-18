import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { setListingStatus, savePursuit } from "@/app/actions";
import { hebrewCity, hebrewizeCities } from "@/core/alert";
import { ButtonLink } from "@/components/ui/Button";
import SubmitButton from "@/components/ui/SubmitButton";
import Badge from "@/components/ui/Badge";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Icon from "@/components/ui/Icon";
import { Input, Textarea } from "@/components/ui/Field";
import { DEAL_HE, BROKER_HE, SOURCE_HE, USER_STATUS_HE } from "@/lib/labels";
import { price, relTime } from "@/lib/format";

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

function SectionHead({ color, label }: { color: string; label: string }) {
  return (
    <div className={`mb-2 flex items-baseline gap-2 px-0.5 text-[15px] font-bold ${color}`}>
      <span className="text-[10px]">▼</span>
      {label}
    </div>
  );
}

/** The one place a notification tap lands: everything needed to decide and
 * act on a single apartment — score, reasons, call script, phone, verdict.
 * Speaks the board-row language of the dashboard and the matches list. */
export default async function ListingPage({ params }: { params: { id: string } }) {
  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    include: {
      matches: {
        where: { profile: { active: true } },
        orderBy: { score: "desc" },
        include: { profile: true },
      },
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
  ]
    .filter(Boolean)
    .join(" · ");

  const waDigits = listing.phone?.replace(/\D/g, "");
  const strip =
    listing.userStatus === "DISMISSED"
      ? "bg-[#c4c4c4]"
      : listing.userStatus === "WON"
        ? "bg-good"
        : match && match.score >= 80
          ? "bg-good"
          : "bg-warn";

  const TRIAGE: { status: string; label: string; cls: string }[] = [
    { status: "CONTACTED", label: "התקשרתי", cls: "bg-accent text-white" },
    { status: "VIEWING", label: "נקבע סיור", cls: "bg-special text-white" },
    { status: "DISMISSED", label: "לא רלוונטי", cls: "bg-[#9699a6] text-white" },
    { status: "WON", label: "חתמתי!", cls: "bg-good text-white" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/" className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-accent hover:underline">
        <Icon name="chevron" size={13} className="rotate-180" />
        לדשבורד
      </Link>

      {/* ===== the apartment — board-row anatomy, expanded ===== */}
      <section className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
        <div className="relative p-4 ps-[20px]">
          <span className={`absolute inset-y-0 start-0 w-[6px] ${strip}`} aria-hidden="true" />

          {/* title … price */}
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="min-w-0 text-[18px] font-bold leading-snug">{title}</h1>
            <div className="tnum figtree flex-none text-[22px] font-bold leading-none">
              {listing.price != null ? price(listing.price) : <span className="text-sm font-medium text-muted">מחיר לא צוין</span>}
            </div>
          </div>

          {/* facts */}
          <div className="tnum mt-1 text-[13px] text-muted">{facts}</div>

          {/* chips */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {match && <ScoreBadge score={match.score} size={44} />}
            <Badge tone="neutral">{SOURCE_HE[listing.source] ?? listing.source}</Badge>
            {listing.userStatus !== "NEW" && <Badge tone="accent">{USER_STATUS_HE[listing.userStatus]}</Badge>}
            <span className="text-xs text-faint">נמצאה {relTime(listing.createdAt)}</span>
          </div>

          {/* act: THE call gets its own full row; secondary channels share the next */}
          <div className="mt-4 space-y-2">
            {listing.phone ? (
              <>
                <a
                  href={`tel:${listing.phone}`}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-badge bg-accent px-4 text-[16px] font-semibold text-white transition-all hover:bg-accent-strong active:scale-[0.98]"
                >
                  <span className="tnum" dir="ltr">📞 {listing.phone}</span>
                </a>
                <div className="flex gap-2">
                  <a
                    href={`https://wa.me/${waDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[42px] flex-1 items-center justify-center rounded-badge border border-good bg-card px-4 text-sm font-semibold text-[#00854d] transition-all hover:bg-good-soft active:scale-[0.98]"
                  >
                    וואטסאפ למפרסם
                  </a>
                  {listing.url && (
                    <ButtonLink href={listing.url} external variant="secondary" size="sm" icon="external" className="min-h-[42px] flex-1">
                      המודעה המקורית
                    </ButtonLink>
                  )}
                </div>
              </>
            ) : (
              <>
                {listing.url && (
                  <ButtonLink href={listing.url} external variant="primary" icon="external" className="min-h-[46px] flex-1">
                    פתח מודעה — הטלפון בפוסט המקורי
                  </ButtonLink>
                )}
                <p className="w-full text-xs text-faint">לא זוהה מספר טלפון בפוסט.</p>
              </>
            )}
          </div>
        </div>

        {/* verdict chips */}
        <div className="grid grid-cols-4 gap-2 border-t border-line bg-card2/60 p-3">
          {TRIAGE.map((t) => (
            <form key={t.status} action={setListingStatus}>
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="status" value={t.status} />
              <SubmitButton
                variant="secondary"
                size="sm"
                className={`min-h-[42px] w-full px-1 ${listing.userStatus === t.status ? t.cls + " border-transparent" : ""}`}
                pendingText="…"
                title={listing.userStatus === t.status ? "לחיצה נוספת מבטלת" : undefined}
              >
                {t.label}
              </SubmitButton>
            </form>
          ))}
        </div>
      </section>

      {/* ===== the call script ===== */}
      {missing.length > 0 && (
        <section>
          <SectionHead color="text-accent" label="לוודא בשיחה" />
          <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
            {missing.map((f) => (
              <div key={f} className="flex items-center gap-2.5 border-b border-line px-4 py-2.5 text-sm last:border-b-0">
                <span className="h-[16px] w-[16px] flex-none rounded-[4px] border-2 border-accent" aria-hidden="true" />
                {f}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== the analysis — one line per fact, like the list ===== */}
      {(pos.length > 0 || neg.length > 0 || flags.length > 0) && (
        <section>
          <SectionHead color="text-muted" label="הניתוח" />
          <div className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
            {pos.map((r) => (
              <div key={`p${r}`} className="border-b border-line px-4 py-2 text-[13px] font-medium text-[#00854d] last:border-b-0">
                ✓ {r}
              </div>
            ))}
            {neg.map((r) => (
              <div key={`n${r}`} className="border-b border-line px-4 py-2 text-[13px] font-medium text-crit last:border-b-0">
                ✗ {r}
              </div>
            ))}
            {flags.map((r) => (
              <div key={`f${r}`} className="border-b border-line px-4 py-2 text-[13px] font-medium text-[#b06000] last:border-b-0">
                🚩 {r}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ===== pursuit tracking ===== */}
      <section>
        <SectionHead color="text-special" label="מעקב" />
        <div className="rounded-xl2 border border-line bg-card p-4 shadow-card">
          <form action={savePursuit} className="space-y-3">
            <input type="hidden" name="listingId" value={listing.id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-semibold">סיור</span>
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
                <span className="font-semibold">הערה</span>
                <div className="mt-1">
                  <Textarea name="userNote" rows={1} defaultValue={listing.userNote ?? ""} placeholder="למשל: לחזור אחרי 18:00, רוצה ערבים" />
                </div>
              </label>
            </div>
            <SubmitButton variant="secondary" size="sm" pendingText="שומר…">
              שמור מעקב
            </SubmitButton>
          </form>
        </div>
      </section>

      {/* ===== the original post ===== */}
      <section>
        <SectionHead color="text-muted" label={`הפוסט המקורי · ${SOURCE_HE[listing.source] ?? listing.source}`} />
        <div className="rounded-xl2 border border-line bg-card p-4 shadow-card">
          <pre dir="auto" className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
            {listing.rawText}
          </pre>
        </div>
      </section>
    </div>
  );
}

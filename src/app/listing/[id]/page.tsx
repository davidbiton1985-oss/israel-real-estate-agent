import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { setListingStatus, savePursuit } from "@/app/actions";
import { hebrewCity } from "@/core/alert";
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

/** The one place a notification tap lands: everything needed to decide and
 * act on a single apartment — score, reasons, call script, phone, verdict. */
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

  const pos = parseArr(match?.reasonsPositive);
  const neg = parseArr(match?.reasonsNegative);
  const missing = parseArr(match?.missingFields);
  const flags = parseArr(match?.redFlags);

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

  const TRIAGE: { status: string; label: string; cls: string }[] = [
    { status: "CONTACTED", label: "התקשרתי", cls: "bg-accent text-white" },
    { status: "VIEWING", label: "נקבע סיור", cls: "bg-special text-white" },
    { status: "DISMISSED", label: "לא רלוונטי", cls: "bg-[#9699a6] text-white" },
    { status: "WON", label: "חתמתי!", cls: "bg-good text-white" },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
        <Icon name="chevron" size={13} className="rotate-180" />
        לדשבורד
      </Link>

      {/* facts card */}
      <section className="overflow-hidden rounded-xl2 border border-line bg-card shadow-card">
        <div className="relative p-4 ps-[20px]">
          <span
            className={`absolute inset-y-0 start-0 w-[6px] ${
              listing.userStatus === "DISMISSED" ? "bg-[#c4c4c4]" : listing.userStatus === "WON" ? "bg-good" : match && match.score >= 80 ? "bg-accent" : "bg-warn"
            }`}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[19px] font-bold">{title}</h1>
              <div className="tnum mt-0.5 text-[13px] text-muted">{facts}</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-faint">
                <Badge tone="neutral">{SOURCE_HE[listing.source] ?? listing.source}</Badge>
                {listing.userStatus !== "NEW" && <Badge tone="accent">{USER_STATUS_HE[listing.userStatus]}</Badge>}
                נמצאה {relTime(listing.createdAt)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="figtree tnum text-[26px] font-bold leading-none">
                {listing.price != null ? price(listing.price) : <span className="text-base text-muted">מחיר לא צוין</span>}
              </div>
              {match && <ScoreBadge score={match.score} size={44} />}
            </div>
          </div>

          {/* act: call first */}
          <div className="mt-4 flex flex-wrap gap-2">
            {listing.phone && (
              <>
                <a
                  href={`tel:${listing.phone}`}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-badge bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent-strong active:scale-[0.98]"
                >
                  📞 חייג {listing.phone}
                </a>
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-badge border border-good bg-card px-4 py-2.5 text-sm font-semibold text-[#00854d] transition-all hover:bg-good-soft active:scale-[0.98]"
                >
                  וואטסאפ
                </a>
              </>
            )}
            {listing.url && (
              <ButtonLink href={listing.url} external variant={listing.phone ? "secondary" : "primary"} icon="external">
                פתח מודעה
              </ButtonLink>
            )}
          </div>
          {!listing.phone && (
            <p className="mt-2 text-xs text-faint">לא זוהה טלפון בפוסט — צור קשר דרך המודעה המקורית.</p>
          )}
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
                className={`w-full ${listing.userStatus === t.status ? t.cls + " border-transparent" : ""}`}
                pendingText="…"
                title={listing.userStatus === t.status ? "לחיצה נוספת מבטלת" : undefined}
              >
                {t.label}
              </SubmitButton>
            </form>
          ))}
        </div>
      </section>

      {/* the call script + reasons */}
      {(missing.length > 0 || pos.length > 0 || neg.length > 0 || flags.length > 0) && (
        <section className="rounded-xl2 border border-line bg-card p-4 shadow-card">
          {missing.length > 0 && (
            <div className="mb-3 rounded-badge bg-accent-soft px-3 py-2.5">
              <div className="text-[13px] font-bold text-accent">לוודא בשיחה:</div>
              <ul className="mt-1 space-y-0.5 text-sm text-ink">
                {missing.map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {pos.length > 0 && (
              <div>
                <span className="me-1 font-semibold text-[#00854d]">✓ למה התאים:</span>
                <span className="text-muted">{pos.join(" · ")}</span>
              </div>
            )}
            {neg.length > 0 && (
              <div>
                <span className="me-1 font-semibold text-crit">✗ חולשות:</span>
                <span className="text-muted">{neg.join(" · ")}</span>
              </div>
            )}
            {flags.length > 0 && (
              <div className="sm:col-span-2">
                <span className="me-1 font-semibold text-[#b06000]">🚩 דגלים:</span>
                <span className="text-muted">{flags.join(" · ")}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* pursuit tracking */}
      <section className="rounded-xl2 border border-line bg-card p-4 shadow-card">
        <h2 className="mb-3 text-[13px] font-bold text-special">מעקב</h2>
        <form action={savePursuit} className="space-y-3">
          <input type="hidden" name="listingId" value={listing.id} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-semibold">סיור</span>
              <div className="mt-1">
                <Input
                  type="datetime-local"
                  name="viewingAt"
                  defaultValue={listing.viewingAt ? new Date(listing.viewingAt.getTime() - listing.viewingAt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
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
      </section>

      {/* the original post */}
      <section className="rounded-xl2 border border-line bg-card p-4 shadow-card">
        <h2 className="mb-2 text-[13px] font-bold text-muted">הפוסט המקורי · {SOURCE_HE[listing.source] ?? listing.source}</h2>
        <pre dir="auto" className="whitespace-pre-wrap rounded-badge bg-card2/70 p-3 text-[13.5px] leading-relaxed text-ink">
          {listing.rawText}
        </pre>
      </section>
    </div>
  );
}

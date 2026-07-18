import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { hebrewCity } from "@/core/alert";
import ScoreBadge from "@/components/ui/ScoreBadge";
import Thumb from "@/components/ui/Thumb";
import SourceMark from "@/components/ui/SourceMark";
import PhotoPlaceholder from "@/components/ui/PhotoPlaceholder";
import { USER_STATUS_HE } from "@/lib/labels";
import { price } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "בטיפול" };

/** The pursuit wall: every apartment David is actively chasing, ordered by
 * the nearest viewing. The placard carries the NEXT STEP, not the price. */
export default async function PursuitPage() {
  const pursuits = await prisma.listing.findMany({
    where: { userStatus: { in: ["CONTACTED", "VIEWING", "WON"] } },
    include: { matches: { where: { profile: { active: true } }, orderBy: { score: "desc" }, take: 1 } },
    orderBy: [{ viewingAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div>
      <div className="flex items-baseline justify-between pt-3">
        <h1 className="display text-[24px]">בטיפול</h1>
        <span className="tnum text-sm text-muted">{pursuits.length}</span>
      </div>

      {pursuits.length === 0 ? (
        <div className="mt-8 rounded-xl2 bg-card p-8 text-center shadow-card">
          <div className="text-3xl">📞</div>
          <div className="mt-2 text-[16px] font-bold">עוד אין דירות בטיפול</div>
          <p className="mx-auto mt-1 max-w-[270px] text-sm leading-relaxed text-muted">
            כשתסמן על דירה ״התקשרתי״ או ״נקבע סיור״ — היא תעבור לכאן, עם התאריך וההערות שלך.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-[18px]">
          {pursuits.map((l) => {
            const step = l.viewingAt
              ? `סיור · ${l.viewingAt.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })} ${l.viewingAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
              : USER_STATUS_HE[l.userStatus];
            return (
              <div key={l.id} className="rise relative overflow-hidden rounded-xl2 bg-card shadow-card">
                <Link href={`/listing/${l.id}`} className="absolute inset-0 z-[1]" aria-label="פרטי הדירה" />
                <div className="relative aspect-[16/9] bg-card2">
                  {l.imageUrl ? (
                    <Thumb src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <PhotoPlaceholder />
                  )}
                  <div className="placard">
                    <span className="display tnum text-[17px] leading-none">{step}</span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-[16.5px] font-bold">
                    {[hebrewCity(l.city), l.neighborhood ?? l.street].filter(Boolean).join(" · ")}
                  </div>
                  <div className="tnum mt-0.5 text-[13px] text-muted">
                    {l.price != null ? price(l.price) : "מחיר לא צוין"}
                    {l.rooms != null ? ` · ${l.rooms} חד׳` : ""}
                    {l.phone ? " · 📞 יש טלפון" : ""}
                  </div>
                  {l.userNote && <div className="mt-1.5 text-[13px] text-ink">״{l.userNote}״</div>}
                  <div className="mt-2 flex items-center">
                    {l.matches[0] && <ScoreBadge score={l.matches[0].score} showWord={false} />}
                    <span className="ms-auto text-[11.5px] font-semibold text-accent">{USER_STATUS_HE[l.userStatus]}</span>
                    {l.url && (
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative z-[2] ms-2 inline-flex min-h-[30px] items-center gap-1 rounded-full bg-card2 px-3 text-[11.5px] font-bold text-ink transition-all active:scale-95"
                      >
                        <SourceMark source={l.source} size={13} />
                        למודעה ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

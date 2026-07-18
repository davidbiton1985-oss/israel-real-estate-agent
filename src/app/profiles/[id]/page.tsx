import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import ProfileForm from "@/components/ProfileForm";
import SubmitButton from "@/components/ui/SubmitButton";
import PushToggle from "@/components/ui/PushToggle";
import { runScanAction, sendTestAlertAction } from "@/app/actions";
import { emailConfigVars } from "@/core/connectors/email";
import { telegramConfigured } from "@/core/alert";
import { relTime, minutesSince } from "@/lib/format";
import type { SourceHealth } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "פרופיל" };

function stateOf(h: SourceHealth | null): { cls: string; word: string } {
  if (!h?.lastSuccessAt) return { cls: "bg-faint", word: "לא מחובר" };
  const m = minutesSince(h.lastSuccessAt) ?? 9999;
  if (m < 12 && h.consecutiveErrors === 0) return { cls: "bg-accent led-live", word: "פעיל" };
  if (m < 360) return { cls: "bg-warn", word: "לא עדכני" };
  return { cls: "bg-faint", word: "אבד קשר" };
}

export default async function EditProfilePage({ params }: { params: { id: string } }) {
  const [profile, yad2, fb, emailH] = await Promise.all([
    prisma.profile.findUnique({ where: { id: params.id } }),
    prisma.sourceHealth.findUnique({ where: { source: "YAD2_BROWSER" } }),
    prisma.sourceHealth.findUnique({ where: { source: "FACEBOOK" } }),
    prisma.sourceHealth.findUnique({ where: { source: "EMAIL" } }),
  ]);
  if (!profile) notFound();
  const email = emailConfigVars();

  const sensors = [
    { name: "יד2", h: yad2 },
    { name: "פייסבוק", h: fb },
    { name: "אימייל", h: email.configured ? emailH : null },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display pt-3 text-[24px]">הפרופיל שלך</h1>
      <p className="mt-1 text-sm text-muted">מה אתה מחפש — הבוט מנקד כל מודעה מול זה ומתריע רק על מה שמתאים.</p>

      <div className="mt-5">
        <ProfileForm profile={profile} />
      </div>

      {/* the operator drawer — sensors + tools, off the gallery */}
      <div className="whisper mt-8 px-1" id="sensors">
        חיישנים
      </div>
      <div className="mt-3 overflow-hidden rounded-xl2 bg-card shadow-card">
        {sensors.map((s) => {
          const st = stateOf(s.h);
          return (
            <div key={s.name} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <i className={`h-2 w-2 rounded-full ${st.cls}`} />
              <span className="text-sm font-bold">{s.name}</span>
              <span className="ms-auto text-xs text-muted">
                {st.word}
                {s.h?.lastSuccessAt ? ` · ${relTime(s.h.lastSuccessAt)}` : ""}
              </span>
            </div>
          );
        })}
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <i className={`h-2 w-2 rounded-full ${telegramConfigured() ? "bg-accent" : "bg-faint"}`} />
          <span className="text-sm font-bold">התראות לנייד</span>
          <span className="ms-auto text-xs text-muted">{telegramConfigured() ? "טלגרם + מסך נעילה" : "לא מוגדר"}</span>
        </div>
      </div>

      <div className="whisper mt-7 px-1">כלים</div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <form action={runScanAction}>
          <SubmitButton variant="secondary" size="sm" icon="search" pendingText="בודק…">
            בדוק אימייל וממתינות
          </SubmitButton>
        </form>
        <form action={sendTestAlertAction}>
          <SubmitButton variant="secondary" size="sm" icon="chat" pendingText="שולח…">
            התראת בדיקה
          </SubmitButton>
        </form>
        <PushToggle />
        <Link
          href="/add-listing"
          className="inline-flex min-h-[40px] items-center rounded-full bg-card px-4 text-[13.5px] font-bold shadow-card active:scale-[0.97]"
        >
          + הוספת מודעה ידנית
        </Link>
      </div>
    </div>
  );
}

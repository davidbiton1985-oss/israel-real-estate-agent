import type { Metadata } from "next";
import ProfileForm from "@/components/ProfileForm";

export const metadata: Metadata = { title: "פרופיל חדש" };

export default function NewProfilePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">פרופיל חיפוש חדש</h1>
        <p className="mt-1 text-sm text-muted">
          הגדר מה אתה מחפש — המערכת תנקד כל מודעה מול הפרופיל ותשלח התראה לנייד על התאמות חזקות.
        </p>
      </div>
      <ProfileForm />
    </div>
  );
}

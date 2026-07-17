import type { Profile } from "@prisma/client";
import { saveProfile } from "@/app/actions";
import SubmitButton from "@/components/ui/SubmitButton";
import { Field, Input, Select, Checkbox, FormSection } from "@/components/ui/Field";
import { BROKER_PREF_HE, FEATURE_HE } from "@/lib/labels";

// Presentation only — every `name` attribute matches saveProfile() exactly.

const FEATURE_OPTIONS = [
  { value: "REQUIRED", label: "חובה" },
  { value: "PREFERRED", label: "עדיפות" },
  { value: "INDIFFERENT", label: "לא משנה" },
];

const BROKER_FEE_OPTIONS = [
  { value: "no_fee_only", label: "רק ללא עמלת תיווך" },
  { value: "fee_allowed", label: "עמלה מותרת" },
  { value: "unknown_allowed", label: "גם לא ידוע" },
  { value: "max_fee_if_known", label: "עמלה עד סכום מסוים (אם ידוע)" },
];

export default function ProfileForm({ profile }: { profile?: Profile }) {
  return (
    <form action={saveProfile} className="space-y-5">
      {profile && <input type="hidden" name="id" value={profile.id} />}

      <FormSection legend="בסיס">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="שם הפרופיל">
            <Input name="name" defaultValue={profile?.name ?? ""} required placeholder="דירת 4 חדרים בגני תקווה" />
          </Field>
          <Field label="סוג עסקה">
            <Select name="dealType" defaultValue={profile?.dealType ?? "RENT"}>
              <option value="RENT">השכרה</option>
              <option value="SALE">מכירה</option>
            </Select>
          </Field>
        </div>
      </FormSection>

      <FormSection legend="מיקום">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="ערים" hint="מופרדות בפסיק">
            <Input name="cities" defaultValue={profile?.cities ?? ""} required placeholder="גני תקווה, קרית אונו" />
          </Field>
          <Field label="הגבלת שכונות" hint='למשל "הרצליה: גליל ים" — רק שכונות אלו בעיר; ערים בלי רשומה פתוחות'>
            <Input name="neighborhoods" defaultValue={profile?.neighborhoods ?? ""} placeholder="הרצליה: גליל ים" />
          </Field>
          <Field label="רחובות" hint="לא חובה">
            <Input name="streets" defaultValue={profile?.streets ?? ""} />
          </Field>
        </div>
      </FormSection>

      <FormSection legend="מחיר, חדרים וגודל">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="מחיר מינימלי ₪" hint="לא חובה">
            <Input name="priceMin" type="number" defaultValue={profile?.priceMin ?? ""} />
          </Field>
          <Field label="מחיר מקסימלי ₪ *">
            <Input name="priceMax" type="number" defaultValue={profile?.priceMax ?? ""} required placeholder="7500" />
          </Field>
          <Field label="חדרים — מינימום">
            <Input name="roomsMin" type="number" step="0.5" defaultValue={profile?.roomsMin ?? ""} />
          </Field>
          <Field label="חדרים — מקסימום">
            <Input name="roomsMax" type="number" step="0.5" defaultValue={profile?.roomsMax ?? ""} />
          </Field>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="גודל מינימלי (מ״ר)">
            <Input name="sizeMinSqm" type="number" defaultValue={profile?.sizeMinSqm ?? ""} />
          </Field>
          <Field label="סוג נכס">
            <Select name="propertyType" defaultValue={profile?.propertyType ?? ""}>
              <option value="">הכל</option>
              <option value="APARTMENT">דירה</option>
              <option value="GARDEN_APT">דירת גן</option>
              <option value="PENTHOUSE">פנטהאוז</option>
              <option value="DUPLEX">דופלקס</option>
              <option value="HOUSE">בית פרטי</option>
            </Select>
          </Field>
          <Field label="כניסה עד תאריך" hint="לא חובה">
            <Input name="entryBy" type="date" defaultValue={profile?.entryBy ?? ""} />
          </Field>
        </div>
      </FormSection>

      <FormSection legend="מאפיינים">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {(["balcony", "parking", "elevator", "mamad"] as const).map((f) => (
            <Field key={f} label={FEATURE_HE[f]}>
              <Select name={f} defaultValue={profile?.[f] ?? "INDIFFERENT"}>
                {FEATURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        </div>
      </FormSection>

      <FormSection legend="תיווך">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="סינון תיווך">
            <Select name="brokerStatusPref" defaultValue={profile?.brokerStatusPref ?? "any"}>
              {Object.entries(BROKER_PREF_HE).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="עמלת תיווך">
            <Select name="brokerFeePref" defaultValue={profile?.brokerFeePref ?? "unknown_allowed"}>
              {BROKER_FEE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="עמלה מקסימלית ₪" hint="רלוונטי רק ל״עמלה עד סכום מסוים״">
            <Input name="maxFeeIfKnown" type="number" defaultValue={profile?.maxFeeIfKnown ?? ""} />
          </Field>
        </div>
      </FormSection>

      <FormSection legend="התראות">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="סף התראה לנייד" hint="דירה בציון הזה ומעלה → הודעה מיידית (טלגרם + מסך נעילה)">
            <Input name="whatsappThreshold" type="number" min={0} max={100} defaultValue={profile?.whatsappThreshold ?? 80} />
          </Field>
          <Field label="סף תקציר הבדיקה" hint="דירות בציון הזה ומעלה (שלא קיבלו התראה) נכללות בתקציר הבדיקה">
            <Input name="dashboardThreshold" type="number" min={0} max={100} defaultValue={profile?.dashboardThreshold ?? 60} />
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          <Checkbox name="active" defaultChecked={profile?.active ?? true} label="פרופיל פעיל" />
          <Checkbox
            name="priceDropReAlert"
            defaultChecked={profile?.priceDropReAlert ?? true}
            label="שלח התראה חוזרת אם המחיר יורד או שהפרטים משתנים מהותית (חדרים / מרפסת / חניה / תיווך)"
          />
        </div>
      </FormSection>

      <SubmitButton icon="check" pendingText="שומר…">
        {profile ? "שמור שינויים" : "צור פרופיל"}
      </SubmitButton>
    </form>
  );
}

import type { Profile } from "@prisma/client";
import { saveProfile } from "@/app/actions";

const FEATURE_OPTIONS = [
  { value: "REQUIRED", label: "Required" },
  { value: "PREFERRED", label: "Preferred" },
  { value: "INDIFFERENT", label: "Doesn't matter" },
];

const BROKER_STATUS_OPTIONS = [
  { value: "any", label: "הכל" },
  { value: "private_only", label: "רק ללא תיווך" },
  { value: "broker_only", label: "רק בתיווך" },
  { value: "private_preferred_broker_allowed_if_strong_match", label: "עדיף ללא תיווך, אבל תיווך מותר אם הנכס מתאים מאוד" },
  { value: "unknown_allowed", label: "לא משנה / גם לא ידוע" },
];

const BROKER_FEE_OPTIONS = [
  { value: "no_fee_only", label: "רק ללא עמלת תיווך" },
  { value: "fee_allowed", label: "עמלה מותרת" },
  { value: "unknown_allowed", label: "גם לא ידוע" },
  { value: "max_fee_if_known", label: "עמלה עד סכום מסוים (אם ידוע)" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = "w-full border border-slate-300 rounded px-3 py-2 text-sm";

export default function ProfileForm({ profile }: { profile?: Profile }) {
  return (
    <form action={saveProfile} className="space-y-6 bg-white rounded shadow p-6">
      {profile && <input type="hidden" name="id" value={profile.id} />}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Profile name">
          <input name="name" defaultValue={profile?.name ?? ""} required className={inputCls} placeholder="4-room rental in Ganei Tikva" />
        </Field>
        <Field label="Deal type">
          <select name="dealType" defaultValue={profile?.dealType ?? "RENT"} className={inputCls}>
            <option value="RENT">Rent (השכרה)</option>
            <option value="SALE">Sale (מכירה)</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Cities (comma-separated)">
          <input name="cities" defaultValue={profile?.cities ?? ""} required className={inputCls} placeholder="Ganei Tikva, Kiryat Ono" />
        </Field>
        <Field label="Neighborhoods (optional)">
          <input name="neighborhoods" defaultValue={profile?.neighborhoods ?? ""} className={inputCls} />
        </Field>
        <Field label="Streets (optional)">
          <input name="streets" defaultValue={profile?.streets ?? ""} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Field label="Min price ₪ (optional)">
          <input name="priceMin" type="number" defaultValue={profile?.priceMin ?? ""} className={inputCls} />
        </Field>
        <Field label="Max price ₪ *">
          <input name="priceMax" type="number" defaultValue={profile?.priceMax ?? ""} required className={inputCls} placeholder="7500" />
        </Field>
        <Field label="Min rooms">
          <input name="roomsMin" type="number" step="0.5" defaultValue={profile?.roomsMin ?? ""} className={inputCls} />
        </Field>
        <Field label="Max rooms">
          <input name="roomsMax" type="number" step="0.5" defaultValue={profile?.roomsMax ?? ""} className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Min size (sqm)">
          <input name="sizeMinSqm" type="number" defaultValue={profile?.sizeMinSqm ?? ""} className={inputCls} />
        </Field>
        <Field label="Property type">
          <select name="propertyType" defaultValue={profile?.propertyType ?? ""} className={inputCls}>
            <option value="">Any</option>
            <option value="APARTMENT">Apartment (דירה)</option>
            <option value="GARDEN_APT">Garden apt (דירת גן)</option>
            <option value="PENTHOUSE">Penthouse (פנטהאוז)</option>
            <option value="DUPLEX">Duplex (דופלקס)</option>
            <option value="HOUSE">House (בית פרטי)</option>
          </select>
        </Field>
        <Field label="Entry needed by (optional)">
          <input name="entryBy" type="date" defaultValue={profile?.entryBy ?? ""} className={inputCls} />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-700 mb-2">Features</legend>
        <div className="grid grid-cols-4 gap-4">
          {(["balcony", "parking", "elevator", "mamad"] as const).map((f) => (
            <Field key={f} label={{ balcony: "Balcony (מרפסת)", parking: "Parking (חניה)", elevator: "Elevator (מעלית)", mamad: 'Mamad (ממ"ד)' }[f]}>
              <select name={f} defaultValue={profile?.[f] ?? "INDIFFERENT"} className={inputCls}>
                {FEATURE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          ))}
        </div>
      </fieldset>

      <fieldset className="border-t pt-4">
        <legend className="text-sm font-semibold text-slate-700">Brokerage (תיווך)</legend>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <Field label="Broker filter">
            <select name="brokerStatusPref" dir="rtl" defaultValue={profile?.brokerStatusPref ?? "any"} className={inputCls}>
              {BROKER_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Broker fee preference">
            <select name="brokerFeePref" dir="rtl" defaultValue={profile?.brokerFeePref ?? "unknown_allowed"} className={inputCls}>
              {BROKER_FEE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Max fee ₪ (if 'עמלה עד סכום מסוים')">
            <input name="maxFeeIfKnown" type="number" defaultValue={profile?.maxFeeIfKnown ?? ""} className={inputCls} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="border-t pt-4">
        <legend className="text-sm font-semibold text-slate-700">Alerts</legend>
        <div className="grid grid-cols-3 gap-4 mt-2">
          <Field label="WhatsApp alert threshold (score)">
            <input name="whatsappThreshold" type="number" min={0} max={100} defaultValue={profile?.whatsappThreshold ?? 80} className={inputCls} />
          </Field>
          <Field label="Dashboard threshold (score)">
            <input name="dashboardThreshold" type="number" min={0} max={100} defaultValue={profile?.dashboardThreshold ?? 60} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" name="active" defaultChecked={profile?.active ?? true} />
            <span className="text-sm">Active</span>
          </label>
        </div>
        <label className="flex items-center gap-2 mt-3">
          <input type="checkbox" name="priceDropReAlert" defaultChecked={profile?.priceDropReAlert ?? true} />
          <span className="text-sm">Re-alert if this listing later drops in price or changes materially (rooms/balcony/parking/broker status)</span>
        </label>
      </fieldset>

      <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
        {profile ? "Save changes" : "Create profile"}
      </button>
    </form>
  );
}

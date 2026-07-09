// Every enum→Hebrew mapping in one place. Stored values (DB/enums) never
// change — only their presentation. Tones reference the Badge component's
// reserved status palette.
import type { BadgeTone } from "@/components/ui/Badge";

export const SOURCE_HE: Record<string, string> = {
  YAD2: "יד2",
  FACEBOOK: "פייסבוק",
  WHATSAPP: "וואטסאפ",
  MANUAL: "ידני",
  URL: "קישור",
  DEMO: "דמו",
  EMAIL: "אימייל",
};

export const STATUS_HE: Record<string, string> = {
  strong_match: "התאמה חזקה",
  possible_match: "התאמה אפשרית",
  weak_match: "התאמה חלשה",
  rejected: "נדחה",
};

export const STATUS_TONE: Record<string, BadgeTone> = {
  strong_match: "good",
  possible_match: "warn",
  weak_match: "neutral",
  rejected: "crit",
};

export const DEAL_HE: Record<string, string> = {
  RENT: "השכרה",
  SALE: "מכירה",
};

export const BROKER_HE: Record<string, string> = {
  PRIVATE: "פרטי",
  BROKER: "מתיווך",
  UNKNOWN: "לא ידוע",
};

export const FEE_HE: Record<string, string> = {
  NONE: "ללא עמלה",
  EXISTS: "יש עמלה",
  UNKNOWN: "עמלה לא ידועה",
};

export const CONFIDENCE_HE: Record<string, string> = {
  high: "ביטחון גבוה",
  medium: "ביטחון בינוני",
  low: "ביטחון נמוך",
};

export const BROKER_PREF_HE: Record<string, string> = {
  any: "הכל",
  private_only: "רק ללא תיווך",
  broker_only: "רק בתיווך",
  private_preferred_broker_allowed_if_strong_match: "עדיף ללא תיווך, תיווך מותר בהתאמה חזקה",
  unknown_allowed: "לא משנה / גם לא ידוע",
};

export const FB_SURFACE_HE: Record<string, string> = {
  GROUP: "קבוצה",
  PAGE: "עמוד",
  PROFILE: "פרופיל",
  PUBLIC_POST: "פוסט ציבורי",
  SHARED: "פוסט משותף",
  MARKETPLACE: "מרקטפלייס",
  UNKNOWN: "פייסבוק",
};

export const OUTCOME_HE: Record<string, string> = {
  new: "✓ מודעה חדשה נוספה.",
  price_drop: "📉 זוהתה ירידת מחיר במודעה קיימת — נשלחה התראה.",
  material_change: "🔄 פרטי המודעה השתנו מאז ההתראה האחרונה — נשלחה התראה.",
  suppressed: "מודעה קיימת עודכנה — ללא התראה חדשה (שום דבר מהותי לא השתנה).",
  updated: "מודעה קיימת עודכנה (נותחה ונוקדה מחדש).",
};

export const ALERT_REASON_HE: Record<string, string> = {
  NEW_MATCH: "התאמה חדשה",
  PRICE_DROP: "ירידת מחיר",
  MATERIAL_CHANGE: "שינוי בפרטים",
  TEST: "בדיקה",
  DUPLICATE_SUPPRESSED: "כפילות — הושתקה",
  NO_CHANGE_SUPPRESSED: "ללא שינוי — הושתקה",
};

export const ALERT_STATUS_HE: Record<string, string> = {
  SENT: "נשלחה",
  SENDING: "נשלחת",
  QUEUED: "בתור",
  FAILED: "נכשלה",
  SUPPRESSED: "הושתקה",
};

export const ALERT_STATUS_TONE: Record<string, BadgeTone> = {
  SENT: "good",
  SENDING: "accent",
  QUEUED: "accent",
  FAILED: "crit",
  SUPPRESSED: "neutral",
};

export const PROPERTY_HE: Record<string, string> = {
  APARTMENT: "דירה",
  GARDEN_APT: "דירת גן",
  PENTHOUSE: "פנטהאוז",
  DUPLEX: "דופלקס",
  HOUSE: "בית פרטי",
  STUDIO: "סטודיו",
};

export const FEATURE_HE: Record<string, string> = {
  balcony: "מרפסת",
  parking: "חניה",
  elevator: "מעלית",
  mamad: 'ממ"ד',
};

import { addListing } from "@/app/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import Icon from "@/components/ui/Icon";

export default function AddListingPage({ searchParams }: { searchParams: { urlSaved?: string; yad2Id?: string } }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">הוספה ידנית</h1>
        <p className="mt-1 text-sm text-muted">
          המסלול הרגיל הוא אוטומטי — הסורקים קולטים מודעות לבד. השתמש בדף הזה למודעה שהגיעה אליך
          בערוץ אחר (הודעת וואטסאפ ממתווך, פוסט שלא נקלט) או לבדיקת הפענוח על טקסט מסוים.
        </p>
      </div>

      {searchParams.urlSaved && (
        <div className="flex items-center gap-2 rounded-xl2 border border-line bg-good-soft px-4 py-3 text-sm text-good">
          <Icon name="check" size={16} />
          הקישור נשמר{searchParams.yad2Id ? ` (מזהה יד2: ${searchParams.yad2Id})` : ""}. הדבק למטה גם את
          טקסט המודעה — הניקוד וההתראות רצים רק כשיש טקסט לנתח.
        </div>
      )}

      <Card className="p-6">
        <form action={addListing} className="space-y-4">
          <Field label="מקור">
            <Select name="source" defaultValue="YAD2">
              <option value="YAD2">יד2</option>
              <option value="FACEBOOK">פוסט פייסבוק</option>
              <option value="WHATSAPP">הודעת וואטסאפ / מתווך</option>
              <option value="MANUAL">ידני / אחר</option>
              <option value="URL">קישור בלבד</option>
            </Select>
          </Field>
          <Field label="קישור למודעה" hint="לא חובה — ביד2 עוזר לזיהוי כפילויות">
            <Input name="url" type="url" dir="ltr" placeholder="https://www.yad2.co.il/realestate/item/..." className="text-start" />
          </Field>
          <Field label="טקסט המודעה" hint="הדבק את הפוסט המלא; אפשר להשאיר ריק כדי לשמור רק קישור">
            <Textarea
              name="rawText"
              dir="auto"
              rows={10}
              placeholder={'להשכרה בגני תקווה! דירת 4 חדרים, 100 מ"ר, מרפסת שמש, קומה 2 עם מעלית, ללא תיווך. 7,200 ש"ח. כניסה מיידית.'}
            />
          </Field>
          <Button icon="spark">נתח, נקד והתאם</Button>
        </form>
      </Card>

      <p className="text-xs text-faint">
        קישורים נשמרים כהפניה בלבד — המערכת לא מושכת דפים מיד2/פייסבוק בעצמה (עיצוב שמכבד תנאי שימוש).
      </p>
    </div>
  );
}

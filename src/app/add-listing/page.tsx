import { addListing } from "@/app/actions";

const inputCls = "w-full border border-slate-300 rounded px-3 py-2 text-sm";

export default function AddListingPage({ searchParams }: { searchParams: { urlSaved?: string; yad2Id?: string } }) {
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Add Listing — Quick Capture</h1>
      <p className="text-slate-600 text-sm">
        Paste a listing from Yad2, Facebook, a WhatsApp/broker message, or any source. Hebrew and English both work.
        The listing is parsed, scored against all active profiles, and strong matches trigger an alert. If you re-paste a
        listing that already exists (same Yad2 URL/ID, source URL, or matching content), it updates the existing listing
        in place instead of creating a duplicate — a price drop or a change to rooms/balcony/parking/broker status can
        trigger a fresh re-alert; an unchanged repeat is suppressed.
      </p>
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
        For Yad2/Facebook: copy the listing text or share/paste the link here. The app does not scrape or bypass
        platform restrictions.
      </div>

      {searchParams.urlSaved && (
        <div className="bg-amber-50 border border-amber-300 rounded p-3 text-sm text-amber-900">
          ✓ URL saved{searchParams.yad2Id ? ` (Yad2 ID: ${searchParams.yad2Id})` : ""}. Paste the listing text below for
          better parsing — scoring and alerts only run once there&apos;s text to work with.
        </div>
      )}

      <form action={addListing} className="space-y-4 bg-white rounded shadow p-6">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Source</span>
          <select name="source" className={inputCls + " mt-1"} defaultValue="YAD2">
            <option value="YAD2">Yad2</option>
            <option value="FACEBOOK">Facebook post</option>
            <option value="WHATSAPP">WhatsApp / broker message</option>
            <option value="MANUAL">Manual / other</option>
            <option value="URL">URL only</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Listing URL (optional — for Yad2, paste the listing link)</span>
          <input name="url" type="url" placeholder="https://www.yad2.co.il/realestate/item/..." className={inputCls + " mt-1"} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">
            Listing text (paste the full post — leave empty to save just the URL for now)
          </span>
          <textarea
            name="rawText"
            dir="auto"
            rows={10}
            className={inputCls + " mt-1"}
            placeholder={'להשכרה בגני תקווה! דירת 4 חדרים, 100 מ"ר, מרפסת שמש, קומה 2 עם מעלית, ללא תיווך. 7,200 ש"ח. כניסה מיידית.'}
          />
        </label>
        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
          Parse, score &amp; match
        </button>
      </form>
      <div className="text-xs text-slate-400">
        Note: URLs are stored as references. Live fetching of Yad2/Facebook pages is intentionally not performed (ToS/robots-safe design).
        See <code>docs/browser-helper.md</code> for an optional bookmarklet that copies the current page&apos;s title/URL/selection to your
        clipboard, ready to paste here.
      </div>
    </div>
  );
}

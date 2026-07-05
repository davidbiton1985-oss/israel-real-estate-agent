import { addListing } from "@/app/actions";

const inputCls = "w-full border border-slate-300 rounded px-3 py-2 text-sm";

export default function AddListingPage({ searchParams }: { searchParams: { urlSaved?: string; yad2Id?: string } }) {
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Manual Add — fallback / debug</h1>
      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-900">
        <b>The main workflow is automatic:</b> the 5-minute watcher ingests saved-search alert emails (Yad2 etc.) and
        WhatsApps you strong matches on its own — see the dashboard&apos;s &quot;Automatic ingestion&quot; panel and the README setup.
        Use this page only for listings that don&apos;t arrive by email (e.g. a Facebook post or a broker WhatsApp message),
        or to debug the parser against a specific text.
      </div>
      <p className="text-slate-600 text-sm">
        Paste any listing text (Hebrew or English) — it goes through the exact same pipeline as automatic ingestion:
        parsed, deduped, scored against all active profiles, and alerted if strong. Re-pasting an existing listing
        (same Yad2 URL/ID, source URL, or matching content) updates it in place — a price drop or a material change can
        trigger a fresh re-alert; an unchanged repeat is suppressed.
      </p>

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

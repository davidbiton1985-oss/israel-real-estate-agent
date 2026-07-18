/** Instant skeleton while a force-dynamic page renders — in a standalone PWA
 * there is no browser progress bar, so silence reads as "frozen". */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-label="טוען…">
      <div className="h-24 rounded-xl2 bg-card2" />
      <div className="h-20 rounded-xl2 border border-line bg-card" />
      <div className="space-y-2">
        <div className="h-4 w-28 rounded bg-card2" />
        <div className="h-28 rounded-xl2 border border-line bg-card" />
        <div className="h-28 rounded-xl2 border border-line bg-card" />
      </div>
    </div>
  );
}

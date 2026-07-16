// Score chip 0–100. Band tone mirrors match status semantics
// (strong ≥80 · possible ≥60 · weak/rejected muted) — color never stands
// alone, the number is always shown.
function bandCls(score: number): string {
  if (score >= 80) return "bg-accent-soft text-accent";
  if (score >= 60) return "bg-warn-soft text-warn";
  return "bg-card2 text-muted";
}

export default function ScoreBadge({ score, size }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const large = (size ?? 0) >= 44;
  return (
    <span
      title={`ציון ${clamped}/100`}
      className={`tnum inline-flex shrink-0 items-baseline gap-1 rounded-full font-extrabold ${bandCls(clamped)} ${
        large ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      {clamped}
      <small className="text-[10px] font-medium opacity-75">התאמה</small>
    </span>
  );
}

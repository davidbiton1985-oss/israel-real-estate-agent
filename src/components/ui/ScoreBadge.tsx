// Score as a monday status block: solid color, white bold number — the same
// visual grammar as a board status. ≥80 green (strong) · 60–79 orange
// (possible) · below gray. Color never stands alone; the number always shows.
function bandCls(score: number): string {
  if (score >= 80) return "bg-good";
  if (score >= 60) return "bg-warn";
  return "bg-[#c4c4c4]";
}

export default function ScoreBadge({ score, size }: { score: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const large = (size ?? 0) >= 44;
  return (
    <span
      title={`ציון ${clamped}/100`}
      className={`tnum inline-grid shrink-0 place-items-center rounded-badge font-bold text-white ${bandCls(clamped)} ${
        large ? "h-[34px] min-w-[56px] px-3 text-[16px]" : "h-[26px] min-w-[44px] px-2 text-[13px]"
      }`}
    >
      {clamped}
    </span>
  );
}

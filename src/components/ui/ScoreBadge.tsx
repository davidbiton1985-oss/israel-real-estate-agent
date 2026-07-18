// V3: the score is TYPOGRAPHY, not a chip — a Secular One numeral in the
// band color with a quiet word beside it. ≥80 landed green · 60–79 amber ·
// below stone. The number always shows; color never stands alone.
function band(score: number): { cls: string; word: string } {
  if (score >= 80) return { cls: "text-accent", word: "התאמה גבוהה" };
  if (score >= 60) return { cls: "text-warn", word: "שווה מבט" };
  return { cls: "text-faint", word: "התאמה נמוכה" };
}

export default function ScoreBadge({
  score,
  size,
  showWord = true,
}: {
  score: number;
  size?: number;
  showWord?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const b = band(clamped);
  const large = (size ?? 0) >= 44;
  return (
    <span className="inline-flex items-baseline gap-1.5" title={`ציון ${clamped}/100`}>
      <span className={`display tnum ${b.cls} ${large ? "text-[26px]" : "text-[18px]"} leading-none`}>{clamped}</span>
      {showWord && <span className="text-[12px] font-semibold text-muted">{b.word}</span>}
    </span>
  );
}

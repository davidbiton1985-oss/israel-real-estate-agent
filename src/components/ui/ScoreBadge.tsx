// Score ring: SVG arc 0–100. Band color mirrors match status semantics
// (strong ≥80 good · possible ≥60 warn-ish accent · weak/rejected muted).
function bandColor(score: number): string {
  if (score >= 80) return "var(--good)";
  if (score >= 60) return "var(--warn)";
  return "var(--faint)";
}

export default function ScoreBadge({ score, size = 56 }: { score: number; size?: number }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const filled = (clamped / 100) * c;
  const color = bandColor(clamped);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`ציון ${clamped}/100`}>
      <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden="true">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <div className="tnum absolute inset-0 flex items-center justify-center font-display text-base font-bold">
        {clamped}
      </div>
    </div>
  );
}

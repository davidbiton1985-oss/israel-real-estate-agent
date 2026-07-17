import Icon, { type IconName } from "./Icon";

// Status colors are reserved for state and always ship with a label (and icon
// where it matters) — never color alone (dataviz rule).
export type BadgeTone = "good" | "warn" | "crit" | "accent" | "neutral";

// monday soft labels: tinted fill, saturated text, no heavy borders.
const TONES: Record<BadgeTone, string> = {
  good: "bg-good-soft text-[#00854d]",
  warn: "bg-warn-soft text-[#b06000]",
  crit: "bg-crit-soft text-crit",
  accent: "bg-accent-soft text-accent",
  neutral: "bg-card2 text-muted border border-line",
};

export default function Badge({
  tone = "neutral",
  icon,
  className = "",
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

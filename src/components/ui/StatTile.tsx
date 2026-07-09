import Link from "next/link";
import Icon, { type IconName } from "./Icon";

/** Hero-number stat tile (dataviz spec: the number is the chart). With `href`
 * the whole tile is a link into the relevant filtered view. */
export default function StatTile({
  value,
  label,
  icon,
  hint,
  href,
}: {
  value: React.ReactNode;
  label: string;
  icon?: IconName;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start justify-between">
      <div>
        <div className="tnum font-display text-3xl font-bold leading-tight">{value}</div>
        <div className="mt-0.5 text-sm text-muted">{label}</div>
        {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
      </div>
      {icon && (
        <div className="rounded-lg bg-accent-soft p-2 text-accent">
          <Icon name={icon} size={18} />
        </div>
      )}
    </div>
  );
  const cls = "block rounded-xl2 border border-line bg-card p-4 shadow-card";
  if (href) {
    return (
      <Link href={href} className={`${cls} transition-shadow hover:shadow-lift`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

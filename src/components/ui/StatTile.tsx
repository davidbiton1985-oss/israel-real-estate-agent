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
        <div className="tnum text-[26px] font-extrabold leading-tight tracking-tight">{value}</div>
        <div className="mt-0.5 text-xs text-muted">{label}</div>
        {hint && <div className="mt-1 text-xs text-faint">{hint}</div>}
      </div>
      {icon && (
        <span className="mt-0.5 text-faint">
          <Icon name={icon} size={16} />
        </span>
      )}
    </div>
  );
  const cls = "block rounded-xl2 border border-line bg-card px-4 py-3.5";
  if (href) {
    return (
      <Link href={href} className={`${cls} transition-shadow hover:shadow-lift`}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

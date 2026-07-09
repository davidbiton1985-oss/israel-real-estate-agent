import { Card } from "./Card";
import Icon, { type IconName } from "./Icon";

/** Hero-number stat tile (dataviz spec: the number is the chart). */
export default function StatTile({
  value,
  label,
  icon,
  hint,
}: {
  value: React.ReactNode;
  label: string;
  icon?: IconName;
  hint?: string;
}) {
  return (
    <Card className="p-4">
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
    </Card>
  );
}

import Icon, { type IconName } from "./Icon";

export default function EmptyState({
  icon = "search",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl2 bg-card px-6 py-12 text-center shadow-card">
      <div className="rounded-full bg-card p-3 text-faint shadow-card">
        <Icon name={icon} size={24} />
      </div>
      <div className="text-[16px] font-bold">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

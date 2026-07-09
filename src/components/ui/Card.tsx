export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl2 border border-line bg-card shadow-card ${className}`}>
      {children}
    </div>
  );
}

/** Section heading with optional trailing action, display typeface. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 className="font-display text-xl font-semibold">{children}</h2>
      {action}
    </div>
  );
}

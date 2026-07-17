export function Card({
  className = "",
  style,
  children,
}: {
  className?: string;
  /** Passthrough for CSS custom properties. */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl2 border border-line bg-card shadow-card ${className}`} style={style}>
      {children}
    </div>
  );
}

/** Section eyebrow with optional trailing action — quiet label over content. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-4">
      <h2 className="text-xs font-medium tracking-[0.08em] text-faint">{children}</h2>
      {action}
    </div>
  );
}

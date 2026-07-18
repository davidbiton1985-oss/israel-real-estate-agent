export function Card({
  className = "",
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  // V3: cards float on ambient shadow — no borders, generous radius.
  return (
    <div className={`rounded-xl2 bg-card shadow-card ${className}`} style={style}>
      {children}
    </div>
  );
}

/** Quiet gallery wayfinding label with optional trailing action. */
export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4 px-1">
      <h2 className="whisper">{children}</h2>
      {action}
    </div>
  );
}

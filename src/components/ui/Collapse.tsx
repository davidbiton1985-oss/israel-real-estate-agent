import Icon from "./Icon";

/** Styled <details> — quiet by default, chevron rotates on open (CSS in globals). */
export default function Collapse({
  summary,
  defaultOpen = false,
  children,
}: {
  summary: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="re-collapse group rounded-lg border border-line bg-card2/50" open={defaultOpen}>
      <summary className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted transition-colors hover:text-ink">
        <span className="chev inline-flex text-faint">
          <Icon name="chevron" size={12} />
        </span>
        {summary}
      </summary>
      <div className="border-t border-line px-3 py-2">{children}</div>
    </details>
  );
}

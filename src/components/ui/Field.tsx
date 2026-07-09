// Form primitives — one visual language for every input in the app.
// These are presentation-only wrappers: the `name` attributes flowing to the
// server actions are supplied by callers and must never change here.

export const inputCls =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors hover:border-faint focus:border-accent focus:outline-none";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="ms-2 text-xs text-faint">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${inputCls} ${className}`} {...rest} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return <select className={`${inputCls} ${className}`} {...rest} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${inputCls} ${className}`} {...rest} />;
}

/** Checkbox with its label — accent-colored check, generous hit target. */
export function Checkbox({
  label,
  ...rest
}: { label: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
      <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}

/** Card-styled form section with a proper header row (not a floating legend). */
export function FormSection({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-xl2 border border-line bg-card shadow-card">
      <div className="border-b border-line px-5 py-3">
        <span className="font-display text-base font-semibold">{legend}</span>
      </div>
      <div className="p-5">{children}</div>
    </fieldset>
  );
}

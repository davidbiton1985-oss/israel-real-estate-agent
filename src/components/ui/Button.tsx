import Link from "next/link";
import Icon, { type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

// monday button grammar: solid blue primary, quiet white secondary, 4px radius.
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink border border-transparent hover:bg-accent-strong",
  secondary: "bg-card text-ink border border-linestrong hover:bg-card2",
  ghost: "bg-transparent text-accent border border-accent hover:bg-accent-soft",
  danger: "bg-transparent text-crit border border-transparent hover:bg-crit-soft",
};

const SIZES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
};

const BASE =
  "inline-flex items-center justify-center rounded-badge font-semibold transition-all select-none whitespace-nowrap active:scale-[0.98]";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  className?: string;
  children: React.ReactNode;
}

/** Submit/action button — works inside <form action={serverAction}>. */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  className = "",
  children,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}

/** Same look as Button, renders a Next <Link> (internal) or <a> (external). */
export function ButtonLink({
  href,
  external = false,
  variant = "secondary",
  size = "md",
  icon,
  className = "",
  children,
}: CommonProps & { href: string; external?: boolean }) {
  const cls = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  const inner = (
    <>
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  );
}

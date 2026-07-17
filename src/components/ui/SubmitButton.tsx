"use client";

// Submit button with a pending state — server actions take seconds (scans,
// Twilio sends); the user must see that something is happening.
import { useFormStatus } from "react-dom";
import Icon, { type IconName } from "./Icon";

const VARIANTS = {
  primary: "bg-accent text-accent-ink border border-transparent hover:bg-accent-strong",
  secondary: "bg-card text-ink border border-linestrong hover:bg-card2",
  danger: "bg-transparent text-crit border border-transparent hover:bg-crit-soft",
} as const;

const SIZES = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
} as const;

function Spinner({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export default function SubmitButton({
  variant = "primary",
  size = "md",
  icon,
  pendingText,
  confirmText,
  title,
  className = "",
  children,
}: {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  icon?: IconName;
  /** Shown while the action runs, e.g. "סורק…" */
  pendingText?: string;
  /** If set, asks for confirmation before submitting (destructive actions). */
  confirmText?: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <button
      disabled={pending}
      title={title}
      onClick={confirmText ? (e) => !window.confirm(confirmText) && e.preventDefault() : undefined}
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-badge font-semibold transition-all select-none active:scale-[0.98] disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {pending ? <Spinner size={iconSize} /> : icon ? <Icon name={icon} size={iconSize} /> : null}
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}

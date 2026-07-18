/** Quiet stand-in for a listing with no photo yet — keeps every card the
 * same shape (the sensors backfill photos as they spot the ad again). */
export default function PhotoPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-card2">
      <svg
        viewBox="0 0 24 24"
        width={compact ? 26 : 44}
        height={compact ? 26 : 44}
        fill="none"
        stroke="var(--faint)"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 8.7V20h13V8.7" />
        <path d="M9.5 20v-5.5h5V20" />
      </svg>
    </div>
  );
}

/** Tiny brand mark so the listing's origin reads at a glance — the Facebook
 * "f" roundel or a mini Yad2 orange tile. Email and unknown sources get a
 * quiet envelope. */
export default function SourceMark({ source, size = 15 }: { source: string; size?: number }) {
  if (source === "FACEBOOK") {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="פייסבוק" className="inline-block flex-none">
        <circle cx="12" cy="12" r="12" fill="#1877F2" />
        <path
          d="M15.9 12.3h-2.5V20h-3.1v-7.7H8.4V9.6h1.9V8c0-2.1 1.1-3.5 3.5-3.5l2.2.1v2.7h-1.4c-.9 0-1.2.4-1.2 1.1v1.2h2.8l-.3 2.7z"
          fill="#fff"
        />
      </svg>
    );
  }
  if (source === "YAD2") {
    return (
      <span
        role="img"
        aria-label="יד2"
        className="inline-flex flex-none items-center justify-center rounded-[4px] font-bold leading-none text-white"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.52), background: "#ff7100" }}
      >
        יד2
      </span>
    );
  }
  return (
    <span role="img" aria-label="אימייל" className="inline-block flex-none leading-none" style={{ fontSize: size - 2 }}>
      ✉️
    </span>
  );
}

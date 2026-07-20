/** The Boton mark — a monogram B on an ink tile, with the green dot that
 * "landed" beside it (the bot found your place). Uses the display face
 * (Secular One), so it matches the wordmark exactly. */
export default function BotonMark({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Boton"
      className={`relative inline-grid flex-none place-items-center ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.28, background: "var(--ink)" }}
    >
      <span className="display leading-none" dir="ltr" style={{ fontSize: size * 0.57, color: "#f6f5f2" }}>
        B
      </span>
      <span
        className="absolute rounded-full"
        style={{
          width: size * 0.125,
          height: size * 0.125,
          right: size * 0.25,
          bottom: size * 0.28,
          background: "var(--accent)",
        }}
      />
    </span>
  );
}

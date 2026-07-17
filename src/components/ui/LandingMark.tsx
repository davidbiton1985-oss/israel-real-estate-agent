/** The Boton mark — "The Landing": three rounded towers (the neighborhood)
 * and the green dot settled in the open spot: the bot found your place.
 * Colors are the monday palette the whole UI speaks. */
export default function LandingMark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} role="img" aria-label="Boton">
      <rect x="5.5" y="6" width="9" height="36" rx="4.5" fill="#0073ea" />
      <rect x="19.5" y="30" width="9" height="12" rx="4.5" fill="#ffcb00" />
      <rect x="33.5" y="14" width="9" height="28" rx="4.5" fill="#a25ddc" />
      <circle cx="24" cy="24" r="6" fill="#00c875" />
    </svg>
  );
}

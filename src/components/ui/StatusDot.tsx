// Live / stale / error LED. Color is never alone — callers pair it with a
// text label; the dot only accents the state.
export type DotState = "live" | "stale" | "error" | "off";

const COLORS: Record<DotState, string> = {
  live: "bg-good",
  stale: "bg-warn",
  error: "bg-crit",
  off: "bg-faint",
};

export default function StatusDot({ state }: { state: DotState }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${COLORS[state]} ${state === "live" ? "led-live" : ""}`}
      aria-hidden="true"
    />
  );
}

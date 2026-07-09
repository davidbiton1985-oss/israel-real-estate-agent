// Minimal geometric stroke icon set — deliberately simple path data (lines,
// circles, short paths) so every icon renders crisply and consistently.
// stroke=currentColor lets the surrounding text color carry the icon.

export type IconName =
  | "home"
  | "search"
  | "bell"
  | "building"
  | "check"
  | "x"
  | "external"
  | "moon"
  | "sun"
  | "filter"
  | "plus"
  | "pencil"
  | "trash"
  | "flag"
  | "clock"
  | "envelope"
  | "chat"
  | "spark"
  | "chevron"
  | "grid"
  | "expand"
  | "pin";

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <>
      <path d="M3.5 11.5 12 4.5l8.5 7" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15.2 15.2 5 5" />
    </>
  ),
  bell: (
    <>
      <path d="M5 17h14l-1.5-2.5V11a5.5 5.5 0 0 0-11 0v3.5L5 17Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  building: (
    <>
      <rect x="6" y="4" width="12" height="16" rx="1" />
      <path d="M9.5 8h1.6M13 8h1.6M9.5 11.5h1.6M13 11.5h1.6M11 20v-3.5h2V20" />
    </>
  ),
  check: <path d="m5 12.5 5 5L19 7" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  external: (
    <>
      <path d="M9.5 5H5v14h14v-4.5" />
      <path d="M13.5 5H19v5.5M19 5l-7.5 7.5" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.3 5.3 7 7M17 17l1.7 1.7M18.7 5.3 17 7M7 17l-1.7 1.7" />
    </>
  ),
  filter: <path d="M4 5h16l-5.5 7v6.5L9.5 16v-4L4 5Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pencil: <path d="m4 20 1.2-4.2L16.8 4.2a2.05 2.05 0 0 1 2.9 2.9L8.2 18.8 4 20Z" />,
  trash: (
    <>
      <path d="M5 7h14M9.5 7V5h5v2" />
      <path d="m7 7 1 13h8l1-13" />
      <path d="M10.2 11v6M13.8 11v6" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2.5 4L17 12H6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  envelope: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4.5 7 7.5 5.5L19.5 7" />
    </>
  ),
  chat: <path d="M4 5.5h16v10.5H10L5.5 19.5V16H4V5.5Z" />,
  spark: (
    <>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4Z" />
      <path d="m18.5 15.5.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </>
  ),
  chevron: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  grid: (
    <>
      <rect x="4.5" y="4.5" width="6" height="6" rx="0.5" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="0.5" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="0.5" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="0.5" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  pin: (
    <>
      <path d="M12 21S5.5 15.6 5.5 11a6.5 6.5 0 0 1 13 0c0 4.6-6.5 10-6.5 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </>
  ),
};

export default function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

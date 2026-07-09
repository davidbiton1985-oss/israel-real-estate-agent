// Presentation formatters — Hebrew locale, LTR-safe numbers.

export function price(n: number): string {
  return `${n.toLocaleString("en-US")} ₪`;
}

export function dateTime(d: Date | string): string {
  return new Date(d).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const REL = new Intl.RelativeTimeFormat("he", { numeric: "auto" });

/** "לפני 4 דקות" / "לפני שעתיים" / "אתמול" — for source-health freshness. */
export function relTime(d: Date | string | null | undefined): string {
  if (!d) return "אף פעם";
  const diffMs = new Date(d).getTime() - Date.now();
  const mins = Math.round(diffMs / 60_000);
  if (Math.abs(mins) < 1) return "ממש עכשיו";
  if (Math.abs(mins) < 60) return REL.format(mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return REL.format(hours, "hour");
  return REL.format(Math.round(hours / 24), "day");
}

/** Minutes since a date — used to classify source freshness. */
export function minutesSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  return (Date.now() - new Date(d).getTime()) / 60_000;
}

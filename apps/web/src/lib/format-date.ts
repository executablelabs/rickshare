// Short, unambiguous dates in the member's own locale, e.g. "Sat 14 Dec, 10:00" and "18 Dec".

export function formatWhen(iso: string, locale?: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day}, ${time}`;
}

export function formatDay(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(iso));
}

/** The end of the chosen calendar day in the member's time zone, as an ISO instant. */
export function endOfDay(dateInput: string): string {
  return new Date(`${dateInput}T23:59:00`).toISOString();
}

/** Tomorrow as a date input value, the earliest end date a new trip may have. */
export function tomorrowInput(now = new Date()): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${month}-${day}`;
}

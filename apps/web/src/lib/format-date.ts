// Short dates in the member's locale; show the year outside the current calendar year.

export function formatWhen(iso: string, locale?: string): string {
  const date = new Date(iso);
  const day = formatDay(iso, locale);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  return `${day}, ${time}`;
}

export function formatDay(iso: string, locale?: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date().getFullYear() ? ({ year: "numeric" } as const) : {}),
  }).format(date);
}

export function formatTripDates(
  startsAt: string | null | undefined,
  endsAt: string,
  locale?: string,
): string {
  const start = startsAt ? new Date(startsAt) : undefined;
  const end = new Date(endsAt);
  const year = new Date().getFullYear();
  const formatter = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(end.getFullYear() !== year || (start && start.getFullYear() !== year)
      ? ({ year: "numeric" } as const)
      : {}),
  });
  return start ? formatter.formatRange(start, end) : `Ends ${formatter.format(end)}`;
}

/** The beginning of the chosen day in the organizer's time zone. */
export function startOfDay(dateInput: string): string {
  return new Date(`${dateInput}T00:00:00`).toISOString();
}

export function todayInput(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

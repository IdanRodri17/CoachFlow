// lib/dates.ts — the ONE place all date logic lives.
//
// Why this file exists (a locked CoachFlow rule — see CLAUDE.md / SRS §2.3):
// every date question — "what is today's workout?", streaks, the missed-workout
// rule, weekly check-ins — must be answered in the USER'S LOCAL TIME ZONE,
// defaulting to Asia/Jerusalem. Comparing raw UTC timestamps would make a
// workout look "missed" or a streak break at the wrong moment near midnight.
//
// We represent a calendar day as a plain "YYYY-MM-DD" string. Two of these can
// be compared with normal string operators (<, >, ===) because that format
// sorts chronologically as text. No external date library needed: we use the
// built-in Intl API, which Expo's Hermes engine supports (including time zones).

export const DEFAULT_TIME_ZONE = "Asia/Jerusalem";

/**
 * Format any Date as "YYYY-MM-DD" *as seen in* the given time zone.
 * Example: a UTC instant late on the 27th may already be the 28th in Jerusalem.
 */
export function toDateString(
  date: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  // The "en-CA" locale formats dates as YYYY-MM-DD, which is exactly what we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's calendar date ("YYYY-MM-DD") in the given time zone. */
export function todayISO(timeZone: string = DEFAULT_TIME_ZONE): string {
  return toDateString(new Date(), timeZone);
}

/** True if the given "YYYY-MM-DD" is today (in the user's time zone). */
export function isToday(
  dateISO: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  return dateISO === todayISO(timeZone);
}

/**
 * True if the given "YYYY-MM-DD" is strictly before today (user-local).
 * This is the basis of the "missed workout" rule (SRS §4.1): a scheduled
 * workout counts as missed when its date is before today and it isn't completed.
 */
export function isBeforeToday(
  dateISO: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  return dateISO < todayISO(timeZone);
}

/**
 * Whole-day difference (a − b) between two "YYYY-MM-DD" strings.
 * Date-only, so it's time-zone independent. Used later for streak gap logic.
 * Example: daysBetween("2026-06-28", "2026-06-26") === 2.
 */
export function daysBetween(aISO: string, bISO: string): number {
  const MS_PER_DAY = 86_400_000;
  // Parse both at UTC midnight; since neither has a time component, the offset
  // cancels out and we get a clean integer day count.
  const a = Date.parse(`${aISO}T00:00:00Z`);
  const b = Date.parse(`${bISO}T00:00:00Z`);
  return Math.round((a - b) / MS_PER_DAY);
}

/** Returns the "YYYY-MM-DD" that is `days` after the given date (date-only math). */
export function addDays(dateISO: string, days: number): string {
  const ms = Date.parse(`${dateISO}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Human-friendly label for a "YYYY-MM-DD", e.g. "Mon, Jul 6".
 * Interprets the date at midday so the weekday is right in the user's zone.
 */
export function formatDisplayDate(
  dateISO: string,
  locale: string = "en",
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(d);
}

/** Day of week for a "YYYY-MM-DD": 0 = Sunday … 6 = Saturday. */
export function weekdayOf(dateISO: string): number {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay();
}

/** Returns the "YYYY-MM-DD" that is `months` calendar months after the date. */
export function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  // Date.UTC rolls month overflow into the year automatically.
  return new Date(Date.UTC(y, m - 1 + months, d, 12, 0, 0)).toISOString().slice(0, 10);
}

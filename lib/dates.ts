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

// lib/schedule.ts — scheduling rules shared by the form and the insert.
//
// expandScheduleDates() is the one definition of "which dates does this
// schedule create": a single date, or every chosen weekday from the start date
// until N weeks / N calendar months later (months via lib/dates addMonths,
// which clamps month ends). The schedule form counts with it for "קביעת N
// אימונים" and schedule/new.tsx builds its insert from the same rule, so the
// button and the insert can't disagree. Unit-tested in lib/schedule.test.ts.
//
// V23 (Step 13): a third length, "until the package ends" — unit "sessions",
// exactly `count` workouts on the chosen weekdays. sessionsUntilPackageEnds()
// decides that count, so the form's chip, its summary and the insert all
// come from these two functions.

import { addDays, addMonths, weekdayOf } from "./dates";

export type ScheduleRepeat = {
  /** Weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  count: number;
  /** "sessions" = exactly `count` workouts (until the package ends). */
  unit: "weeks" | "months" | "sessions";
};

/** More than any real package; a bad count can't make the loop run away. */
export const MAX_SERIES_SESSIONS = 200;

export function expandScheduleDates(date: string, repeat?: ScheduleRepeat): string[] {
  if (!repeat || repeat.days.length === 0) return [date];
  if (repeat.unit === "sessions") {
    // Only real weekdays, or the loop below could never find a match.
    const days = repeat.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    const count = Math.min(Math.floor(repeat.count), MAX_SERIES_SESSIONS);
    if (days.length === 0 || !(count > 0)) return [date];
    const dates: string[] = [];
    for (let d = date; dates.length < count; d = addDays(d, 1)) {
      if (days.includes(weekdayOf(d))) dates.push(d);
    }
    return dates;
  }
  const end = repeat.unit === "months" ? addMonths(date, repeat.count) : addDays(date, repeat.count * 7);
  const dates: string[] = [];
  for (let d = date; d < end; d = addDays(d, 1)) {
    if (repeat.days.includes(weekdayOf(d))) dates.push(d);
  }
  return dates.length > 0 ? dates : [date];
}

// ---------------------------------------------------------------------------
// Until the package ends (V23 Step 13)
// ---------------------------------------------------------------------------

/** A client's package, plus their workouts already scheduled from today on
 * (not completed yet, so not in `used` — but each will use a session). */
export type PackageBalance = { total: number; used: number; upcoming: number };

export type PackagePlan =
  | { ok: true; sessions: number }
  | { ok: false; reason: "noPackage" | "nothingLeft" };

/** How many workouts "until the package ends" creates: what's paid for and
 * neither used nor already on the calendar. Counting only total − used
 * would book the already-scheduled sessions a second time — sessions given
 * away, the exact case trainer_attention's package_used_up warns about. */
export function sessionsUntilPackageEnds(balance: PackageBalance | null): PackagePlan {
  if (!balance) return { ok: false, reason: "noPackage" };
  const left = balance.total - balance.used - balance.upcoming;
  return left > 0 ? { ok: true, sessions: Math.min(left, MAX_SERIES_SESSIONS) } : { ok: false, reason: "nothingLeft" };
}

// ---------------------------------------------------------------------------
// Free slots (D24a): the calendar's "פנוי" rows
// ---------------------------------------------------------------------------

/** The working day the calendar offers free slots in. */
export const DAY_START_MINUTES = 7 * 60;
export const DAY_END_MINUTES = 21 * 60;
/** How long a session is assumed to take (the schema has no duration). */
export const SESSION_MINUTES = 60;
/** The shortest gap worth offering. */
export const MIN_FREE_MINUTES = 60;

export type FreeSlot = { start: string; end: string };

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function toTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Gaps of at least an hour between 07:00 and 21:00 around the day's timed
 * sessions ("HH:MM" or "HH:MM:SS"), each session taking an hour. `fromMinutes`
 * (today: now) moves the start of the day forward, so a gap that's already
 * gone isn't offered. Unit-tested in lib/schedule.test.ts. */
export function freeSlots(times: string[], fromMinutes = 0): FreeSlot[] {
  const starts = times.map(toMinutes).sort((a, b) => a - b);
  const slots: FreeSlot[] = [];
  // "Now" rounds up to the next quarter hour: a slot never starts at 10:59.
  let cursor = Math.max(DAY_START_MINUTES, Math.ceil(fromMinutes / 15) * 15);
  const push = (end: number) => {
    if (end - cursor >= MIN_FREE_MINUTES) slots.push({ start: toTime(cursor), end: toTime(end) });
  };
  for (const start of starts) {
    if (start > cursor) push(Math.min(start, DAY_END_MINUTES));
    cursor = Math.max(cursor, start + SESSION_MINUTES);
  }
  push(DAY_END_MINUTES);
  return slots;
}

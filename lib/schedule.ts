// lib/schedule.ts — scheduling rules shared by the form and the insert.
//
// expandScheduleDates() is the one definition of "which dates does this
// schedule create": a single date, or every chosen weekday from the start date
// until N weeks / N calendar months later (months via lib/dates addMonths,
// which clamps month ends). The schedule form counts with it for "קביעת N
// אימונים" and schedule/new.tsx builds its insert from the same rule, so the
// button and the insert can't disagree. Unit-tested in lib/schedule.test.ts.

import { addDays, addMonths, weekdayOf } from "./dates";

export type ScheduleRepeat = {
  /** Weekdays, 0 = Sunday … 6 = Saturday. */
  days: number[];
  count: number;
  unit: "weeks" | "months";
};

export function expandScheduleDates(date: string, repeat?: ScheduleRepeat): string[] {
  if (!repeat || repeat.days.length === 0) return [date];
  const end = repeat.unit === "months" ? addMonths(date, repeat.count) : addDays(date, repeat.count * 7);
  const dates: string[] = [];
  for (let d = date; d < end; d = addDays(d, 1)) {
    if (repeat.days.includes(weekdayOf(d))) dates.push(d);
  }
  return dates.length > 0 ? dates : [date];
}

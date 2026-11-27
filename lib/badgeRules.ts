// lib/badgeRules.ts — which badges a client has earned (V9's rules), pure so
// they're unit-tested; lib/badges.ts reads the inputs and awards them.
//
//   - first_workout: their first completed workout.
//   - streak_10: the streak (client_streaks, SRS §4.1) reaches 10.
//   - first_month: 30+ days since that first workout.
//
// U7 (2026-11-27): "their first completed workout" is the earlier of their
// first logged workout and their first session marked done. A "with trainer"
// session the trainer marks done ("we trained") has no workout log, and a
// client whose sessions were all marked that way never earned either badge.

import { daysBetween } from "./dates";

export type BadgeType = "first_workout" | "streak_10" | "first_month";

export const FIRST_MONTH_DAYS = 30;

/** The earlier of two YYYY-MM-DD days, ignoring a missing one. */
export function earliestDay(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return a < b ? a : b;
}

export function badgesToAward({
  firstDay,
  streak,
  today,
  already,
}: {
  /** The day of the first completed workout (YYYY-MM-DD, the user's zone), if any. */
  firstDay: string | null;
  /** The best current streak across the client's trainers. */
  streak: number;
  today: string;
  already: ReadonlySet<string>;
}): BadgeType[] {
  const out: BadgeType[] = [];
  if (firstDay != null && !already.has("first_workout")) out.push("first_workout");
  if (streak >= 10 && !already.has("streak_10")) out.push("streak_10");
  if (firstDay != null && !already.has("first_month") && daysBetween(today, firstDay) >= FIRST_MONTH_DAYS) {
    out.push("first_month");
  }
  return out;
}

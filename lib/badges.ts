// lib/badges.ts — deterministic badge awarding (V9).
//
// Badge types (SRS §4 / the V9 playbook prompt):
//   - first_workout: their very first completed workout.
//   - streak_10: current streak reaches 10 — reuses the V8 client_streaks
//     view, never redefines the streak rule (SRS §4.1 stays the one source
//     of truth).
//   - first_month: 30+ days since their first completed workout — a tenure /
//     engagement badge, not a performance one.
// The rules themselves are lib/badgeRules.ts (pure, unit-tested).
//
// Call checkAndAwardBadges(clientId) right after a workout is marked
// completed. It's idempotent: badges has a unique(client_id, type)
// constraint, and we upsert with onConflict + ignoreDuplicates, so calling it
// after every completion never double-awards.
//
// U7 (2026-11-27): Progress calls it too, so a badge earned by a session the
// trainer marked done (no workout log, nothing saved on the client's phone)
// is awarded the next time the client looks, not at their next own save.

import { supabase } from "@/lib/supabase";
import { todayISO, toDateString } from "@/lib/dates";
import { badgesToAward, earliestDay, type BadgeType } from "@/lib/badgeRules";

export type { BadgeType };

/** The day (YYYY-MM-DD) of the client's first completed workout: the earlier
 * of their first workout log and their first session marked done. */
export async function firstWorkoutDay(clientId: string): Promise<string | null> {
  const [logRes, sessionRes] = await Promise.all([
    supabase
      .from("workout_logs")
      .select("completed_at")
      .eq("client_id", clientId)
      .order("completed_at", { ascending: true })
      .limit(1),
    supabase
      .from("scheduled_workouts")
      .select("scheduled_date")
      .eq("client_id", clientId)
      .eq("status", "completed")
      .order("scheduled_date", { ascending: true })
      .limit(1),
  ]);
  if (logRes.error) throw logRes.error;
  if (sessionRes.error) throw sessionRes.error;
  const firstLog = logRes.data[0]?.completed_at;
  return earliestDay(firstLog ? toDateString(new Date(firstLog)) : null, sessionRes.data[0]?.scheduled_date ?? null);
}

export async function checkAndAwardBadges(clientId: string): Promise<BadgeType[]> {
  const [firstDay, streakRes, existingRes] = await Promise.all([
    firstWorkoutDay(clientId),
    // One row per trainer (a client may have had two): a single-row read
    // errored after the workout was already saved, and a retry saved it twice.
    supabase.from("client_streaks").select("current_streak").eq("client_id", clientId),
    supabase.from("badges").select("type").eq("client_id", clientId),
  ]);
  if (streakRes.error) throw streakRes.error;
  if (existingRes.error) throw existingRes.error;

  const toAward = badgesToAward({
    firstDay,
    // The best run, as the client screens show it (clientStreakQuery).
    streak: Math.max(0, ...streakRes.data.map((r) => r.current_streak)),
    today: todayISO(),
    already: new Set(existingRes.data.map((b) => b.type)),
  });
  if (toAward.length === 0) return [];

  const { error } = await supabase
    .from("badges")
    .upsert(
      toAward.map((type) => ({ client_id: clientId, type })),
      { onConflict: "client_id,type", ignoreDuplicates: true },
    );
  if (error) throw error;
  return toAward;
}

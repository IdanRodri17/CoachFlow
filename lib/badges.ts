// lib/badges.ts — deterministic badge awarding (V9).
//
// Badge types (SRS §4 / the V9 playbook prompt):
//   - first_workout: their very first completed workout.
//   - streak_10: current streak reaches 10 — reuses the V8 client_streaks
//     view, never redefines the streak rule (SRS §4.1 stays the one source
//     of truth).
//   - first_month: 30+ days since their first completed workout — a tenure /
//     engagement badge, not a performance one.
//
// Call checkAndAwardBadges(clientId) right after a workout is marked
// completed. It's idempotent: badges has a unique(client_id, type)
// constraint, and we upsert with onConflict + ignoreDuplicates, so calling it
// after every completion never double-awards.

import { supabase } from "@/lib/supabase";
import { daysBetween, todayISO, toDateString } from "@/lib/dates";

export type BadgeType = "first_workout" | "streak_10" | "first_month";

export async function checkAndAwardBadges(clientId: string): Promise<BadgeType[]> {
  const [firstLogRes, streakRes, existingRes] = await Promise.all([
    supabase
      .from("workout_logs")
      .select("completed_at")
      .eq("client_id", clientId)
      .order("completed_at", { ascending: true })
      .limit(1),
    supabase.from("client_streaks").select("current_streak").eq("client_id", clientId).maybeSingle(),
    supabase.from("badges").select("type").eq("client_id", clientId),
  ]);
  if (firstLogRes.error) throw firstLogRes.error;
  if (streakRes.error) throw streakRes.error;
  if (existingRes.error) throw existingRes.error;

  const already = new Set(existingRes.data.map((b) => b.type));
  const firstCompletedAt = firstLogRes.data[0]?.completed_at;
  const toAward: BadgeType[] = [];

  if (firstCompletedAt && !already.has("first_workout")) {
    toAward.push("first_workout");
  }
  if ((streakRes.data?.current_streak ?? 0) >= 10 && !already.has("streak_10")) {
    toAward.push("streak_10");
  }
  if (firstCompletedAt && !already.has("first_month")) {
    const daysSinceFirst = daysBetween(todayISO(), toDateString(new Date(firstCompletedAt)));
    if (daysSinceFirst >= 30) toAward.push("first_month");
  }

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

export const BADGE_INFO: Record<BadgeType, { emoji: string; label: string }> = {
  first_workout: { emoji: "🏅", label: "First Workout" },
  streak_10: { emoji: "🔥", label: "10-Day Streak" },
  first_month: { emoji: "📅", label: "One Month Strong" },
};

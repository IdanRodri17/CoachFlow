// lib/workoutSubject.ts — V17 (Step 7): whose workout is this, and who may
// log it? Decided once, from the scheduled workout and the signed-in user,
// before the workout screen loads anything else.
//
//   * A client logs their own workouts (client mode), as before.
//   * A trainer logs an OFFLINE client's workout (trainer mode): the subject
//     is the managed client, the trainer is `loggedBy` (0032's RLS requires
//     logged_by = the caller on those rows).
//   * An APP client's workout is theirs to log. The trainer sees it read-only:
//     a preview while it's open, the summary once it's completed (RLS gives
//     trainers read access, never write).
//   * A "with trainer" workout opens on its day (Idan, 2026-11-21); before
//     then it's a preview: what's coming, with the recommended weights. A
//     solo one can be done any day (2026-11-26: people training on their own
//     choose when); finished early, the save moves it to today
//     (saveWorkout). A past one that was missed can still be logged late.
//
// Pure, unit-tested in lib/workoutSubject.test.ts.

import type { WorkoutMode, WorkoutSubject } from "./useWorkoutSession";

export type WorkoutAccess =
  | { kind: "log" | "view"; subject: WorkoutSubject; mode: WorkoutMode }
  | { kind: "preview"; subject: WorkoutSubject; mode: WorkoutMode; reason: "notYet" | "clientLogs" }
  | { kind: "denied"; reason: "notYours" };

export function workoutAccess(
  sw: {
    trainer_id: string;
    client_id: string | null;
    managed_client_id: string | null;
    status: "scheduled" | "completed";
    scheduled_date: string;
    with_trainer: boolean;
  },
  user: { id: string; role: "trainer" | "client" },
  /** YYYY-MM-DD in the user's zone (lib/dates.ts todayISO). */
  today: string,
): WorkoutAccess {
  const done = sw.status === "completed";
  // Only a "with trainer" session waits for its day.
  const notYet = !done && sw.scheduled_date > today && sw.with_trainer;

  if (user.role === "client") {
    if (sw.client_id !== user.id) return { kind: "denied", reason: "notYours" };
    const subject: WorkoutSubject = { kind: "app", id: user.id };
    if (done) return { kind: "view", subject, mode: "client" };
    if (notYet) return { kind: "preview", subject, mode: "client", reason: "notYet" };
    return { kind: "log", subject, mode: "client" };
  }

  if (sw.trainer_id !== user.id) return { kind: "denied", reason: "notYours" };
  if (sw.managed_client_id) {
    const subject: WorkoutSubject = { kind: "managed", id: sw.managed_client_id };
    if (done) return { kind: "view", subject, mode: "trainer" };
    if (notYet) return { kind: "preview", subject, mode: "trainer", reason: "notYet" };
    return { kind: "log", subject, mode: "trainer" };
  }
  if (sw.client_id) {
    const subject: WorkoutSubject = { kind: "app", id: sw.client_id };
    if (done) return { kind: "view", subject, mode: "trainer" };
    return { kind: "preview", subject, mode: "trainer", reason: notYet ? "notYet" : "clientLogs" };
  }
  return { kind: "denied", reason: "notYours" };
}

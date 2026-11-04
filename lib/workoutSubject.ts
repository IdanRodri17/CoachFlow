// lib/workoutSubject.ts — V17 (Step 7): whose workout is this, and who may
// log it? Decided once, from the scheduled workout and the signed-in user,
// before the workout screen loads anything else.
//
//   * A client logs their own workouts (client mode), as before.
//   * A trainer logs an OFFLINE client's workout (trainer mode): the subject
//     is the managed client, the trainer is `loggedBy` (0032's RLS requires
//     logged_by = the caller on those rows).
//   * An APP client's workout is theirs to log — a trainer can only view it
//     once it's completed (RLS gives trainers read access, never write).
//
// Pure, unit-tested in lib/workoutSubject.test.ts.

import type { WorkoutMode, WorkoutSubject } from "./useWorkoutSession";

export type WorkoutAccess =
  | { kind: "log" | "view"; subject: WorkoutSubject; mode: WorkoutMode }
  | { kind: "denied"; reason: "appClientLogsOwn" | "notYours" };

export function workoutAccess(
  sw: {
    trainer_id: string;
    client_id: string | null;
    managed_client_id: string | null;
    status: "scheduled" | "completed";
  },
  user: { id: string; role: "trainer" | "client" },
): WorkoutAccess {
  const kind = sw.status === "completed" ? "view" : "log";

  if (user.role === "client") {
    return sw.client_id === user.id
      ? { kind, subject: { kind: "app", id: user.id }, mode: "client" }
      : { kind: "denied", reason: "notYours" };
  }

  if (sw.trainer_id !== user.id) return { kind: "denied", reason: "notYours" };
  if (sw.managed_client_id) return { kind, subject: { kind: "managed", id: sw.managed_client_id }, mode: "trainer" };
  if (sw.client_id && kind === "view") return { kind, subject: { kind: "app", id: sw.client_id }, mode: "trainer" };
  return { kind: "denied", reason: "appClientLogsOwn" };
}

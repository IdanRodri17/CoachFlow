// lib/workoutSubject.test.ts — who may log or view which workout (V17 Step 7).

import { describe, expect, it } from "vitest";

import { workoutAccess } from "@/lib/workoutSubject";

const TRAINER = { id: "t1", role: "trainer" as const };
const CLIENT = { id: "c1", role: "client" as const };

const appWorkout = { trainer_id: "t1", client_id: "c1", managed_client_id: null, status: "scheduled" as const };
const offlineWorkout = { trainer_id: "t1", client_id: null, managed_client_id: "m1", status: "scheduled" as const };

describe("workoutAccess", () => {
  it("a client logs their own workout, as before", () => {
    expect(workoutAccess(appWorkout, CLIENT)).toEqual({
      kind: "log",
      subject: { kind: "app", id: "c1" },
      mode: "client",
    });
  });

  it("a client can't open someone else's workout", () => {
    expect(workoutAccess({ ...appWorkout, client_id: "c2" }, CLIENT)).toEqual({ kind: "denied", reason: "notYours" });
  });

  it("a trainer logs an offline client's workout in trainer mode", () => {
    expect(workoutAccess(offlineWorkout, TRAINER)).toEqual({
      kind: "log",
      subject: { kind: "managed", id: "m1" },
      mode: "trainer",
    });
  });

  it("a completed workout opens read-only", () => {
    expect(workoutAccess({ ...offlineWorkout, status: "completed" }, TRAINER).kind).toBe("view");
    expect(workoutAccess({ ...appWorkout, status: "completed" }, CLIENT).kind).toBe("view");
  });

  it("an app client's open workout is theirs to log, not the trainer's", () => {
    expect(workoutAccess(appWorkout, TRAINER)).toEqual({ kind: "denied", reason: "appClientLogsOwn" });
  });

  it("the trainer may view an app client's completed workout", () => {
    expect(workoutAccess({ ...appWorkout, status: "completed" }, TRAINER)).toEqual({
      kind: "view",
      subject: { kind: "app", id: "c1" },
      mode: "trainer",
    });
  });

  it("another trainer's workout is off limits", () => {
    expect(workoutAccess({ ...offlineWorkout, trainer_id: "t2" }, TRAINER)).toEqual({
      kind: "denied",
      reason: "notYours",
    });
  });
});

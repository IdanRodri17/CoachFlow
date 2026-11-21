// lib/workoutSubject.test.ts — who may log, view or preview which workout
// (V17 Step 7; "not before its day", 2026-11-21).

import { describe, expect, it } from "vitest";

import { workoutAccess } from "@/lib/workoutSubject";

const TRAINER = { id: "t1", role: "trainer" as const };
const CLIENT = { id: "c1", role: "client" as const };
const TODAY = "2026-11-21";

const appWorkout = {
  trainer_id: "t1",
  client_id: "c1",
  managed_client_id: null,
  status: "scheduled" as const,
  scheduled_date: TODAY,
};
const offlineWorkout = {
  trainer_id: "t1",
  client_id: null,
  managed_client_id: "m1",
  status: "scheduled" as const,
  scheduled_date: TODAY,
};

describe("workoutAccess", () => {
  it("a client logs their own workout on its day", () => {
    expect(workoutAccess(appWorkout, CLIENT, TODAY)).toEqual({
      kind: "log",
      subject: { kind: "app", id: "c1" },
      mode: "client",
    });
  });

  it("a client can't open someone else's workout", () => {
    expect(workoutAccess({ ...appWorkout, client_id: "c2" }, CLIENT, TODAY)).toEqual({
      kind: "denied",
      reason: "notYours",
    });
  });

  it("a trainer logs an offline client's workout in trainer mode", () => {
    expect(workoutAccess(offlineWorkout, TRAINER, TODAY)).toEqual({
      kind: "log",
      subject: { kind: "managed", id: "m1" },
      mode: "trainer",
    });
  });

  it("a completed workout opens read-only, whatever its date", () => {
    expect(workoutAccess({ ...offlineWorkout, status: "completed" }, TRAINER, TODAY).kind).toBe("view");
    expect(workoutAccess({ ...appWorkout, status: "completed" }, CLIENT, TODAY).kind).toBe("view");
    expect(
      workoutAccess({ ...appWorkout, status: "completed", scheduled_date: "2026-11-25" }, CLIENT, TODAY).kind,
    ).toBe("view");
  });

  it("a future workout is a preview for everyone, never a start", () => {
    const tomorrow = { scheduled_date: "2026-11-22" };
    expect(workoutAccess({ ...appWorkout, ...tomorrow }, CLIENT, TODAY)).toEqual({
      kind: "preview",
      subject: { kind: "app", id: "c1" },
      mode: "client",
      reason: "notYet",
    });
    expect(workoutAccess({ ...offlineWorkout, ...tomorrow }, TRAINER, TODAY)).toEqual({
      kind: "preview",
      subject: { kind: "managed", id: "m1" },
      mode: "trainer",
      reason: "notYet",
    });
    expect(workoutAccess({ ...appWorkout, ...tomorrow }, TRAINER, TODAY)).toEqual({
      kind: "preview",
      subject: { kind: "app", id: "c1" },
      mode: "trainer",
      reason: "notYet",
    });
  });

  it("a missed workout from an earlier day can still be logged late", () => {
    const yesterday = { scheduled_date: "2026-11-20" };
    expect(workoutAccess({ ...appWorkout, ...yesterday }, CLIENT, TODAY).kind).toBe("log");
    expect(workoutAccess({ ...offlineWorkout, ...yesterday }, TRAINER, TODAY).kind).toBe("log");
  });

  it("an app client's open workout is theirs to log; the trainer gets a preview", () => {
    expect(workoutAccess(appWorkout, TRAINER, TODAY)).toEqual({
      kind: "preview",
      subject: { kind: "app", id: "c1" },
      mode: "trainer",
      reason: "clientLogs",
    });
  });

  it("the trainer may view an app client's completed workout", () => {
    expect(workoutAccess({ ...appWorkout, status: "completed" }, TRAINER, TODAY)).toEqual({
      kind: "view",
      subject: { kind: "app", id: "c1" },
      mode: "trainer",
    });
  });

  it("another trainer's workout is off limits", () => {
    expect(workoutAccess({ ...offlineWorkout, trainer_id: "t2" }, TRAINER, TODAY)).toEqual({
      kind: "denied",
      reason: "notYours",
    });
  });
});

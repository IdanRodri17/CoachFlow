// lib/workoutSubject.test.ts — who may log, view or preview which workout
// (V17 Step 7; "not before its day", 2026-11-21).

import { describe, expect, it } from "vitest";

import { ownLogIdOf, ownWorkoutAccess, ownWorkoutRouteId, workoutAccess } from "@/lib/workoutSubject";

const TRAINER = { id: "t1", role: "trainer" as const };
const CLIENT = { id: "c1", role: "client" as const };
const TODAY = "2026-11-21";

const appWorkout = {
  trainer_id: "t1",
  client_id: "c1",
  managed_client_id: null,
  status: "scheduled" as const,
  scheduled_date: TODAY,
  with_trainer: true,
};
const offlineWorkout = {
  trainer_id: "t1",
  client_id: null,
  managed_client_id: "m1",
  status: "scheduled" as const,
  scheduled_date: TODAY,
  with_trainer: true,
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

  it("a future 'with trainer' workout is a preview for everyone, never a start", () => {
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

  it("a future solo workout can be done early (2026-11-26)", () => {
    const tomorrowSolo = { scheduled_date: "2026-11-22", with_trainer: false };
    expect(workoutAccess({ ...appWorkout, ...tomorrowSolo }, CLIENT, TODAY).kind).toBe("log");
    expect(workoutAccess({ ...offlineWorkout, ...tomorrowSolo }, TRAINER, TODAY).kind).toBe("log");
    // An app client's solo workout is still theirs to log, not the trainer's.
    expect(workoutAccess({ ...appWorkout, ...tomorrowSolo }, TRAINER, TODAY)).toEqual({
      kind: "preview",
      subject: { kind: "app", id: "c1" },
      mode: "trainer",
      reason: "clientLogs",
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

describe("a client's own workout (2026-11-27)", () => {
  const LOG = "0b7e8c1a-3f2d-4c5e-9a1b-2c3d4e5f6a7b";

  it("reads its log id from the route, and nothing else", () => {
    expect(ownLogIdOf(ownWorkoutRouteId(LOG))).toBe(LOG);
    expect(ownLogIdOf(LOG)).toBeNull(); // a scheduled workout's id
    expect(ownLogIdOf("own-")).toBeNull();
    expect(ownLogIdOf("own-not-a-uuid")).toBeNull();
  });

  it("before the save, only a client can open one, to log it", () => {
    expect(ownWorkoutAccess(null, CLIENT)).toEqual({ kind: "log", subject: { kind: "app", id: "c1" }, mode: "client" });
    expect(ownWorkoutAccess(null, TRAINER)).toEqual({ kind: "denied", reason: "notYours" });
  });

  it("once saved, the client views their own and the trainer views it read-only", () => {
    expect(ownWorkoutAccess({ client_id: "c1" }, CLIENT)).toEqual({
      kind: "view",
      subject: { kind: "app", id: "c1" },
      mode: "client",
    });
    expect(ownWorkoutAccess({ client_id: "c1" }, TRAINER)).toEqual({
      kind: "view",
      subject: { kind: "app", id: "c1" },
      mode: "trainer",
    });
  });
});

// lib/workoutSession.test.ts — the workout mode rules (docs/design/DESIGN.md
// §6.2) as plain reducer tests. Time is passed in, so nothing here needs fake
// timers or React Native.

import { describe, expect, it } from "vitest";

import {
  createSession,
  formatClock,
  formatElapsed,
  formatWeight,
  isLastSetOverall,
  nextOpen,
  overview,
  pills,
  prefill,
  progress,
  raisedTarget,
  restLeftMs,
  saveRows,
  sessionPrs,
  setsLogged,
  stepWeight,
  streakAfterCompleting,
  workoutReducer,
  type SessionExercise,
  type WorkoutAction,
  type WorkoutState,
} from "./workoutSession";

const T0 = 1_700_000_000_000;

function ex(over: Partial<SessionExercise> & { exerciseId: string }): SessionExercise {
  return {
    name: over.exerciseId,
    sets: 3,
    targetReps: 10,
    targetWeight: null,
    restSeconds: 90,
    last: null,
    history: [],
    ...over,
  };
}

function run(s: WorkoutState, ...actions: WorkoutAction[]): WorkoutState {
  return actions.reduce(workoutReducer, s);
}

const squat = ex({ exerciseId: "squat", sets: 2, targetReps: 8, last: { weight: 47.5, reps: 8 }, history: [{ weight: 47.5, reps: 8 }], restSeconds: 120 });
const rdl = ex({ exerciseId: "rdl", sets: 2, targetReps: 10, targetWeight: 42.5, last: { weight: 40, reps: 10 }, history: [{ weight: 40, reps: 10 }] });
const legRaise = ex({ exerciseId: "legraise", sets: 1, targetReps: 12, restSeconds: null });

describe("prefill (rule 1)", () => {
  it("takes the higher of last time and the template target", () => {
    expect(prefill(rdl)).toEqual({ weight: 42.5, reps: 10 });
    expect(prefill(ex({ exerciseId: "x", targetWeight: 30, last: { weight: 35, reps: 6 } }))).toEqual({ weight: 35, reps: 10 });
  });
  it("uses the target when there's no history, and bodyweight when there's neither", () => {
    expect(prefill(ex({ exerciseId: "x", targetWeight: 20 })).weight).toBe(20);
    expect(prefill(legRaise).weight).toBeNull();
  });
  it("falls back to last time's reps, then a default, when the template has none", () => {
    expect(prefill(ex({ exerciseId: "x", targetReps: null, last: { weight: 10, reps: 6 } })).reps).toBe(6);
    expect(prefill(ex({ exerciseId: "x", targetReps: null })).reps).toBe(10);
  });
});

describe("one-tap logging (rules 2, 5)", () => {
  it("logs the numbers on screen and starts the exercise's rest", () => {
    const s = run(createSession([squat, rdl], T0), { type: "weight", delta: 2.5 }, { type: "logSet", now: T0 + 5000 });
    expect(s.logs[0]).toEqual([{ weight: 50, reps: 8, pr: true }]);
    expect(s.screen).toBe("rest");
    expect(s.rest?.endsAt).toBe(T0 + 5000 + 120_000);
    expect(s.next).toEqual({ ex: 0, set: 1 });
  });

  it("keeps the numbers just logged for the next set of the same exercise", () => {
    const s = run(
      createSession([squat, rdl], T0),
      { type: "reps", delta: 2 },
      { type: "logSet", now: T0 },
      { type: "restDone", now: T0 + 1000 },
    );
    expect(s.screen).toBe("set");
    expect(s.ex).toBe(0);
    expect(s.reps).toBe(10);
    expect(s.weight).toBe(47.5);
  });

  it("moves to the next exercise with its pre-fill after the last set", () => {
    const s = run(
      createSession([squat, rdl], T0),
      { type: "logSet", now: T0 },
      { type: "restDone", now: T0 },
      { type: "logSet", now: T0 },
    );
    expect(s.next).toEqual({ ex: 1, set: 0 });
    const after = run(s, { type: "restDone", now: T0 });
    expect(after.ex).toBe(1);
    expect(after.weight).toBe(42.5);
    expect(after.reps).toBe(10);
  });

  it("goes straight to Finish after the last set of the workout, with no rest", () => {
    const s = createSession([legRaise], T0);
    expect(isLastSetOverall(s)).toBe(true);
    const done = run(s, { type: "logSet", now: T0 });
    expect(done.screen).toBe("finish");
    expect(done.rest).toBeNull();
  });

  it("never lets weight go below 0 or reps below 1, and leaves bodyweight alone", () => {
    const s = run(createSession([ex({ exerciseId: "x", targetWeight: 2.5, targetReps: 1 })], T0), { type: "weight", delta: -2.5 }, { type: "weight", delta: -2.5 }, { type: "reps", delta: -1 });
    expect(s.weight).toBe(0);
    expect(s.reps).toBe(1);
    expect(run(createSession([legRaise], T0), { type: "weight", delta: 2.5 }).weight).toBeNull();
  });
});

describe("rest timer (rule 3)", () => {
  const resting = run(createSession([squat, rdl], T0), { type: "logSet", now: T0 });

  it("counts down from an absolute end time, so a locked phone stays right", () => {
    expect(restLeftMs(resting, T0 + 20_000)).toBe(100_000);
    expect(restLeftMs(resting, T0 + 999_000)).toBe(0);
  });

  it("±15 moves the end; +15 can grow the total, −15 never goes below 1s", () => {
    const plus = run(resting, { type: "restAdjust", seconds: 15, now: T0 });
    expect(restLeftMs(plus, T0)).toBe(135_000);
    expect(plus.rest?.totalMs).toBe(135_000);
    const minus = run(resting, { type: "restAdjust", seconds: -15, now: T0 + 119_500 });
    expect(restLeftMs(minus, T0 + 119_500)).toBe(1000);
  });

  it("pause freezes the time left; resume continues from there", () => {
    const paused = run(resting, { type: "restPause", now: T0 + 30_000 });
    expect(restLeftMs(paused, T0 + 90_000)).toBe(90_000);
    const resumed = run(paused, { type: "restResume", now: T0 + 90_000 });
    expect(restLeftMs(resumed, T0 + 100_000)).toBe(80_000);
  });

  it("undo goes back to that set with its numbers and removes the log", () => {
    const s = run(createSession([squat, rdl], T0), { type: "weight", delta: 5 }, { type: "logSet", now: T0 }, { type: "undo" });
    expect(s.screen).toBe("set");
    expect(s.logs[0]).toEqual([]);
    expect(s.weight).toBe(52.5);
  });

  it("a natural end is stamped for the 'rest is over' flash; a skip is not", () => {
    expect(run(resting, { type: "restDone", now: T0 + 120_000, natural: true }).restEndedAt).toBe(T0 + 120_000);
    expect(run(resting, { type: "restDone", now: T0 + 5000 }).restEndedAt).toBeNull();
  });

  it("auto rest off: logs and moves on, offering a rest to start by hand", () => {
    const s = run(createSession([squat, rdl], T0), { type: "logSet", now: T0, autoRest: false });
    expect(s.screen).toBe("set");
    expect(s.restOfferSeconds).toBe(120);
    const r = run(s, { type: "startRest", now: T0 + 1000 });
    expect(r.screen).toBe("rest");
    expect(r.next).toEqual({ ex: 0, set: 1 });
  });
});

describe("live PRs (rule 6)", () => {
  it("flags a set that beats the history, and a second PR in the same session", () => {
    const s = run(
      createSession([squat, rdl], T0),
      { type: "logSet", now: T0 }, // 47.5 × 8 = equal, not a PR
      { type: "restDone", now: T0 },
      { type: "weight", delta: 2.5 },
      { type: "logSet", now: T0 }, // 50 × 8 = PR
    );
    expect(s.logs[0].map((l) => l.pr)).toEqual([false, true]);
    expect(sessionPrs(s)).toEqual([{ name: "squat", weight: 50, reps: 8 }]);
  });

  it("never flags the first set of an exercise with no history", () => {
    const s = run(createSession([ex({ exerciseId: "new", targetWeight: 20 })], T0), { type: "logSet", now: T0 });
    expect(s.logs[0][0].pr).toBe(false);
  });
});

describe("swap, skip and jump (rules 7, 8)", () => {
  it("a swap starts from the substitute's numbers and logs against it", () => {
    const s = run(
      createSession([squat, rdl], T0),
      { type: "swap", reason: "המכשיר תפוס", exerciseId: "legpress", name: "לחיצת רגליים", weight: 100, reps: 10 },
      { type: "weight", delta: 50 },
      { type: "logSet", now: T0 },
    );
    expect(s.logs[0][0]).toEqual({ weight: 150, reps: 10, pr: false });
    const rows = saveRows(s);
    expect(rows.sets).toEqual([{ exercise_id: "legpress", set_index: 0, reps: 10, weight: 150 }]);
    expect(rows.adjustments).toEqual([
      { exercise_id: "squat", action: "swapped", swapped_for_exercise_id: "legpress", reason: "המכשיר תפוס" },
    ]);
  });

  it("a skip moves on, shows the segment as done, and saves no sets", () => {
    const s = run(createSession([squat, rdl], T0), { type: "skip", reason: "כאב או אי נוחות" });
    expect(s.ex).toBe(1);
    expect(s.weight).toBe(42.5);
    expect(progress(s)[0]).toEqual({ fraction: 1, skipped: true });
    expect(saveRows(s).sets).toEqual([]);
    expect(saveRows(s).adjustments[0]).toMatchObject({ action: "skipped", reason: "כאב או אי נוחות" });
  });

  it("a skip after some sets keeps the sets that were logged", () => {
    const s = run(createSession([squat, rdl], T0), { type: "logSet", now: T0 }, { type: "restDone", now: T0 }, { type: "skip", reason: "" });
    expect(saveRows(s).sets).toEqual([{ exercise_id: "squat", set_index: 0, reps: 8, weight: 47.5 }]);
    expect(saveRows(s).adjustments[0]).toMatchObject({ exercise_id: "squat", action: "skipped", reason: null });
  });

  it("skipping the last open exercise finishes", () => {
    expect(run(createSession([legRaise], T0), { type: "skip", reason: "" }).screen).toBe("finish");
  });

  it("jump keeps the logs per exercise and refuses finished or skipped ones", () => {
    let s = run(createSession([squat, rdl, legRaise], T0), { type: "logSet", now: T0 }, { type: "restDone", now: T0 });
    s = run(s, { type: "jump", ex: 2 });
    expect(s.ex).toBe(2);
    expect(s.weight).toBeNull();
    s = run(s, { type: "logSet", now: T0 });
    // legRaise is done (1 set) → the next open exercise after it wraps to squat.
    expect(s.next).toEqual({ ex: 0, set: 1 });
    s = run(s, { type: "restDone", now: T0 }, { type: "jump", ex: 2 });
    expect(s.ex).toBe(0);
    expect(s.logs[0]).toHaveLength(1);
  });

  it("finish now saves only what was logged", () => {
    const s = run(createSession([squat, rdl], T0), { type: "logSet", now: T0 }, { type: "finishNow" });
    expect(s.screen).toBe("finish");
    expect(setsLogged(s)).toBe(1);
    expect(saveRows(s).sets).toHaveLength(1);
  });
});

describe("read-outs", () => {
  it("pills show done / now / todo with the logged numbers", () => {
    const s = run(createSession([ex({ exerciseId: "x", sets: 3, targetWeight: 40 })], T0), { type: "logSet", now: T0 }, { type: "restDone", now: T0 });
    expect(pills(s)).toEqual([
      { status: "done", index: 0, weight: 40, reps: 10, pr: false },
      { status: "now", index: 1 },
      { status: "todo", index: 2 },
    ]);
  });

  it("the raised-target line shows only while the stepper still holds the new target", () => {
    const s = createSession([rdl], T0);
    expect(raisedTarget(s)).toBe(42.5);
    expect(raisedTarget(run(s, { type: "weight", delta: -2.5 }))).toBeNull();
    expect(raisedTarget(createSession([ex({ exerciseId: "x", targetWeight: 40 })], T0))).toBeNull();
  });

  it("nextOpen wraps and returns null when everything is done", () => {
    expect(nextOpen([squat, rdl], [[{ weight: 1, reps: 1, pr: false }, { weight: 1, reps: 1, pr: false }], []], [null, null], 0)).toEqual({ ex: 1, set: 0 });
    expect(nextOpen([legRaise], [[{ weight: null, reps: 1, pr: false }]], [null], 0)).toBeNull();
  });

  it("formats weights and clocks the way the reference prints them", () => {
    expect(formatWeight(42.5)).toBe("42.5");
    expect(formatWeight(40)).toBe("40");
    expect(formatClock(90_000)).toBe("1:30");
    expect(formatClock(57_200)).toBe("0:58");
    expect(formatElapsed(18 * 60_000 + 40_000)).toBe("18:40");
    expect(formatElapsed(3_912_000)).toBe("1:05:12");
  });
});

describe("overview and the finish streak (D20d, D20e)", () => {
  it("lists every exercise with its status; while resting, the next one is current", () => {
    const s = run(
      createSession([squat, rdl, legRaise], T0),
      { type: "logSet", now: T0 },
      { type: "restDone", now: T0 },
      { type: "logSet", now: T0 },
    );
    expect(s.screen).toBe("rest");
    const rows = overview(s);
    expect(rows.map((r) => r.status)).toEqual(["done", "current", "open"]);
    expect(rows[0]).toMatchObject({ logged: 2, sets: 2, pr: false, swapped: false, reason: null });
    expect(rows[1].start).toEqual({ weight: 42.5, reps: 10 });
    expect(rows[2].start).toEqual({ weight: null, reps: 12 });
  });

  it("shows skipped exercises with their reason and swaps under the substitute's name", () => {
    const s = run(
      createSession([squat, rdl], T0),
      { type: "swap", reason: "המכשיר תפוס", exerciseId: "legpress", name: "לחיצת רגליים", weight: 100, reps: 10 },
      { type: "jump", ex: 1 },
      { type: "skip", reason: " כאב " },
    );
    const rows = overview(s);
    expect(rows[0]).toMatchObject({ name: "לחיצת רגליים", swapped: true, status: "current", start: { weight: 100, reps: 10 } });
    expect(rows[1]).toMatchObject({ status: "skipped", reason: "כאב" });
  });

  it("the streak tile: today adds one, a future date adds nothing, a past one is unknown", () => {
    expect(streakAfterCompleting(8, "2026-10-03", "2026-10-03")).toBe(9);
    expect(streakAfterCompleting(0, "2026-10-03", "2026-10-03")).toBe(1);
    expect(streakAfterCompleting(8, "2026-10-04", "2026-10-03")).toBe(8);
    expect(streakAfterCompleting(8, "2026-10-01", "2026-10-03")).toBeNull();
  });
});

describe("weight stepper and typing (Idan, 2026-10-03)", () => {
  it("moves 1 kg below 10 kg and 2.5 kg from 10 kg up", () => {
    expect(stepWeight(0, 1)).toBe(1);
    expect(stepWeight(7, 1)).toBe(8);
    expect(stepWeight(9, 1)).toBe(10);
    expect(stepWeight(10, 1)).toBe(12.5);
    expect(stepWeight(42.5, 1)).toBe(45);
    expect(stepWeight(12.5, -1)).toBe(10);
    expect(stepWeight(10, -1)).toBe(9);
    expect(stepWeight(1, -1)).toBe(0);
    expect(stepWeight(0, -1)).toBe(0);
  });

  it("snaps a typed value onto the grid at the next tap", () => {
    expect(stepWeight(7.5, 1)).toBe(8);
    expect(stepWeight(7.5, -1)).toBe(7);
    expect(stepWeight(9.5, 1)).toBe(10);
    expect(stepWeight(11, 1)).toBe(12.5);
    expect(stepWeight(11, -1)).toBe(10);
    expect(stepWeight(13, -1)).toBe(12.5);
  });

  it("typed numbers are clamped and rounded; bodyweight ignores a typed weight", () => {
    const s = createSession([ex({ exerciseId: "x", targetWeight: 20 })], T0);
    expect(run(s, { type: "setWeight", value: 21.25 }).weight).toBe(21.25);
    expect(run(s, { type: "setWeight", value: -3 }).weight).toBe(0);
    expect(run(s, { type: "setWeight", value: Number.NaN }).weight).toBe(20);
    expect(run(s, { type: "setReps", value: 0 }).reps).toBe(1);
    expect(run(s, { type: "setReps", value: 12.4 }).reps).toBe(12);
    expect(run(createSession([legRaise], T0), { type: "setWeight", value: 10 }).weight).toBeNull();
    expect(formatWeight(21.25)).toBe("21.25");
  });
});

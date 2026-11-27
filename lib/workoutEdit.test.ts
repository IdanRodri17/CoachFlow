import { describe, expect, it } from "vitest";

import {
  addExercise,
  addSet,
  editRows,
  isUnchanged,
  prFlagsAfterEdit,
  removeSet,
  updateSet,
  type EditGroup,
  type StoredSet,
} from "./workoutEdit";
import { DEFAULT_REPS } from "./workoutSession";

const bench: EditGroup = {
  exerciseId: "bench",
  name: "Bench",
  sets: [
    { weight: 60, reps: 8 },
    { weight: 60, reps: 6 },
  ],
};
const row: EditGroup = { exerciseId: "row", name: "Row", sets: [{ weight: 40, reps: 10 }] };

let n = 0;
function stored(logId: string, completedAt: string, exerciseId: string, setIndex: number, weight: number | null, reps: number, isPr = false): StoredSet {
  n += 1;
  return { id: `s${n}`, logId, exerciseId, setIndex, weight, reps, isPr, completedAt };
}

describe("the edit form (2026-11-27)", () => {
  it("numbers each exercise's sets from 0 and drops an exercise left with none", () => {
    const groups = removeSet([bench, row], 1, 0);
    expect(groups[1].sets).toEqual([]);
    expect(editRows(groups)).toEqual([
      { exercise_id: "bench", set_index: 0, weight: 60, reps: 8 },
      { exercise_id: "bench", set_index: 1, weight: 60, reps: 6 },
    ]);
  });

  it("a new set repeats the exercise's last one; an empty exercise starts from the default", () => {
    expect(addSet([bench], 0)[0].sets).toEqual([
      { weight: 60, reps: 8 },
      { weight: 60, reps: 6 },
      { weight: 60, reps: 6 },
    ]);
    const empty = removeSet([row], 0, 0);
    expect(addSet(empty, 0)[0].sets).toEqual([{ weight: null, reps: DEFAULT_REPS }]);
  });

  it("adding an exercise that's already there adds a set to it instead", () => {
    const again = addExercise([bench, row], { id: "row", name: "Row" }, { weight: 50, reps: 5 });
    expect(again).toHaveLength(2);
    expect(again[1].sets).toHaveLength(2);
    const added = addExercise([bench], { id: "squat", name: "Squat" }, { weight: 80, reps: 5 });
    expect(added.map((g) => g.exerciseId)).toEqual(["bench", "squat"]);
    expect(added[1].sets).toEqual([{ weight: 80, reps: 5 }]);
  });

  it("changes one set and knows when nothing changed", () => {
    const changed = updateSet([bench], 0, 1, { reps: 7 });
    expect(changed[0].sets[1]).toEqual({ weight: 60, reps: 7 });
    expect(bench.sets[1].reps).toBe(6); // the original is untouched
    expect(isUnchanged([bench], changed)).toBe(false);
    expect(isUnchanged([bench], updateSet(changed, 0, 1, { reps: 6 }))).toBe(true);
  });
});

describe("PR flags after an edit (2026-11-27)", () => {
  it("fixing a 600 kg typo gives the later session its PR back", () => {
    const history = [
      stored("L1", "2026-11-01T08:00:00Z", "bench", 0, 60, 8),
      stored("L2", "2026-11-08T08:00:00Z", "bench", 0, 600, 8, true),
      stored("L3", "2026-11-15T08:00:00Z", "bench", 0, 62.5, 8, false),
    ];
    const l3 = history[2].id;
    const { flags, updates } = prFlagsAfterEdit(history, "L2", "2026-11-08T08:00:00Z", [
      { exercise_id: "bench", set_index: 0, weight: 60, reps: 8 },
    ]);
    expect(flags).toEqual([false]); // 60 × 8 again: not a record
    expect(updates).toEqual([{ id: l3, is_pr: true }]);
  });

  it("a heavier set added to an old session takes a later PR away", () => {
    const history = [
      stored("L1", "2026-11-01T08:00:00Z", "bench", 0, 60, 8),
      stored("L2", "2026-11-08T08:00:00Z", "bench", 0, 62.5, 8, true),
    ];
    const { flags, updates } = prFlagsAfterEdit(history, "L1", "2026-11-01T08:00:00Z", [
      { exercise_id: "bench", set_index: 0, weight: 60, reps: 8 },
      { exercise_id: "bench", set_index: 1, weight: 65, reps: 5 },
    ]);
    // The first set ever is the baseline; 65 beats it within the session.
    expect(flags).toEqual([false, true]);
    expect(updates).toEqual([{ id: history[1].id, is_pr: false }]);
  });

  it("an exercise removed from the session is replayed without it", () => {
    const history = [
      stored("L1", "2026-11-01T08:00:00Z", "bench", 0, 60, 8),
      stored("L1", "2026-11-01T08:00:00Z", "row", 0, 40, 10),
      stored("L2", "2026-11-08T08:00:00Z", "row", 0, 42.5, 10, true),
    ];
    const { flags, updates } = prFlagsAfterEdit(history, "L1", "2026-11-01T08:00:00Z", [
      { exercise_id: "bench", set_index: 0, weight: 60, reps: 8 },
    ]);
    expect(flags).toEqual([false]);
    // Row's first set ever is now L2's: a baseline, not a PR.
    expect(updates).toEqual([{ id: history[2].id, is_pr: false }]);
  });

  it("replays by when each session was done, not by the order rows arrive", () => {
    const history = [
      stored("L3", "2026-11-15T08:00:00Z", "bench", 0, 70, 5, true),
      stored("L1", "2026-11-01T08:00:00Z", "bench", 0, 60, 8),
      stored("L2", "2026-11-08T08:00:00Z", "bench", 1, 65, 5, true),
      stored("L2", "2026-11-08T08:00:00Z", "bench", 0, 62.5, 5, true),
    ];
    // Editing L1's reps only (8 → 10) changes nothing for the later sessions.
    const { flags, updates } = prFlagsAfterEdit(history, "L1", "2026-11-01T08:00:00Z", [
      { exercise_id: "bench", set_index: 0, weight: 60, reps: 10 },
    ]);
    expect(flags).toEqual([false]);
    expect(updates).toEqual([]);
  });

  it("more reps at the same top weight is a PR; a bodyweight set never is", () => {
    const history = [stored("L1", "2026-11-01T08:00:00Z", "bench", 0, 60, 8)];
    const { flags } = prFlagsAfterEdit(history, "L2", "2026-11-08T08:00:00Z", [
      { exercise_id: "bench", set_index: 0, weight: 60, reps: 9 },
      { exercise_id: "bench", set_index: 1, weight: null, reps: 20 },
    ]);
    expect(flags).toEqual([true, false]);
  });

  it("leaves exercises the session never had alone", () => {
    const history = [
      stored("L1", "2026-11-01T08:00:00Z", "bench", 0, 60, 8),
      stored("L9", "2026-11-02T08:00:00Z", "squat", 0, 100, 5, true), // a stale flag, not this edit's business
    ];
    const { updates } = prFlagsAfterEdit(history, "L1", "2026-11-01T08:00:00Z", [
      { exercise_id: "bench", set_index: 0, weight: 62.5, reps: 8 },
    ]);
    expect(updates).toEqual([]);
  });
});

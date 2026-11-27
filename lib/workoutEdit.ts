// lib/workoutEdit.ts — fixing a finished workout (Idan, 2026-11-27: "edit it
// in place"): change a set's reps or weight, add or remove sets, add an
// exercise, change the effort and the note. Whoever logged the workout can
// edit it (the client their own, the trainer an offline client's); the
// save is one transaction, rpc edit_workout_log (0046).
//
// PRs have one rule (lib/pr.ts detectPRs), and an edit can change more than
// its own flags: fixing a 600 kg typo makes the later sessions' real PRs PRs
// again, and a heavier set added here makes a later one no longer a PR. So
// the subject's whole history of the exercises involved is replayed in the
// order it happened (when each session was done, then the set number), with
// the edited session's new sets in place of its old ones, and every flag that
// comes out different is sent with the save.
//
// Pure (unit-tested); the load and the save are subjectSets() and
// saveWorkoutEdit() in lib/useWorkoutSession.ts.

import { detectPRs } from "./pr";
import { DEFAULT_REPS, MAX_REPS, MAX_WEIGHT } from "./workoutSession";

export type EditSet = { weight: number | null; reps: number };
export type EditGroup = { exerciseId: string; name: string; sets: EditSet[] };

/** A set_logs row of the edited session, in save order. */
export type EditedRow = { exercise_id: string; set_index: number; weight: number | null; reps: number };

/** One stored set of the subject's history, with when its session was done. */
export type StoredSet = {
  id: string;
  logId: string;
  exerciseId: string;
  setIndex: number;
  weight: number | null;
  reps: number | null;
  isPr: boolean;
  completedAt: string;
};

// ---------------------------------------------------------------------------
// The form (pure: every change returns new groups)
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function clampReps(n: number): number {
  return Math.min(MAX_REPS, Math.max(1, Math.round(n)));
}

export function clampWeight(n: number): number {
  return Math.min(MAX_WEIGHT, Math.max(0, round2(n)));
}

export function updateSet(groups: EditGroup[], g: number, i: number, patch: Partial<EditSet>): EditGroup[] {
  return groups.map((grp, gi) =>
    gi !== g ? grp : { ...grp, sets: grp.sets.map((s, si) => (si === i ? { ...s, ...patch } : s)) },
  );
}

/** A new set repeats the exercise's last one (the usual "one more like that"). */
export function addSet(groups: EditGroup[], g: number): EditGroup[] {
  return groups.map((grp, gi) => {
    if (gi !== g) return grp;
    const last = grp.sets[grp.sets.length - 1];
    return { ...grp, sets: [...grp.sets, last ? { ...last } : { weight: null, reps: DEFAULT_REPS }] };
  });
}

/** An exercise left with no sets stays on screen until the save, which drops it. */
export function removeSet(groups: EditGroup[], g: number, i: number): EditGroup[] {
  return groups.map((grp, gi) => (gi !== g ? grp : { ...grp, sets: grp.sets.filter((_, si) => si !== i) }));
}

/** Adds an exercise with one set; one that's already there gets another set
 * instead (a session keeps one list per exercise, as the summary shows it). */
export function addExercise(groups: EditGroup[], ex: { id: string; name: string }, first: EditSet): EditGroup[] {
  const at = groups.findIndex((grp) => grp.exerciseId === ex.id);
  if (at >= 0) return addSet(groups, at);
  return [...groups, { exerciseId: ex.id, name: ex.name, sets: [first] }];
}

/** The groups as set_logs rows: each exercise's sets numbered from 0, in the
 * order shown; an exercise with no sets left drops out. */
export function editRows(groups: EditGroup[]): EditedRow[] {
  return groups.flatMap((grp) =>
    grp.sets.map((s, i) => ({ exercise_id: grp.exerciseId, set_index: i, weight: s.weight, reps: s.reps })),
  );
}

export function isUnchanged(before: EditGroup[], after: EditGroup[]): boolean {
  return JSON.stringify(editRows(before)) === JSON.stringify(editRows(after));
}

// ---------------------------------------------------------------------------
// PR flags after the edit
// ---------------------------------------------------------------------------

/**
 * The PR flags once session `logId` (done at `completedAt`) holds `edited`.
 * `stored` is the subject's history of every exercise the session had before
 * the edit or has after it — the session's own old sets included (they're
 * replaced). Returns the flags of `edited`, in order, and every other stored
 * set whose flag changes.
 */
export function prFlagsAfterEdit(
  stored: StoredSet[],
  logId: string,
  completedAt: string,
  edited: EditedRow[],
): { flags: boolean[]; updates: { id: string; is_pr: boolean }[] } {
  const flags = new Array<boolean>(edited.length).fill(false);
  const updates: { id: string; is_pr: boolean }[] = [];
  const exerciseIds = new Set([
    ...edited.map((r) => r.exercise_id),
    ...stored.filter((s) => s.logId === logId).map((s) => s.exerciseId),
  ]);
  const at = (iso: string) => Date.parse(iso);

  for (const exerciseId of exerciseIds) {
    type Item = {
      time: number;
      log: string;
      index: number;
      weight: number | null;
      reps: number | null;
      edited?: number;
      stored?: StoredSet;
    };
    const items: Item[] = [
      ...stored
        .filter((s) => s.exerciseId === exerciseId && s.logId !== logId)
        .map((s) => ({ time: at(s.completedAt), log: s.logId, index: s.setIndex, weight: s.weight, reps: s.reps, stored: s })),
      ...edited.flatMap((r, i) =>
        r.exercise_id === exerciseId
          ? [{ time: at(completedAt), log: logId, index: r.set_index, weight: r.weight, reps: r.reps, edited: i }]
          : [],
      ),
    ];
    items.sort((a, b) => a.time - b.time || (a.log < b.log ? -1 : a.log > b.log ? 1 : 0) || a.index - b.index);
    // The whole history in order, from nothing: the first set ever is the baseline.
    const replay = detectPRs([], items.map(({ weight, reps }) => ({ weight, reps })));
    items.forEach((item, k) => {
      if (item.edited != null) flags[item.edited] = replay[k];
      else if (item.stored && item.stored.isPr !== replay[k]) updates.push({ id: item.stored.id, is_pr: replay[k] });
    });
  }
  return { flags, updates };
}

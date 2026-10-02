// lib/workoutSession.ts — the workout mode's state machine (D20a; rules in
// docs/design/DESIGN.md §6, ported from docs/design/prototype/workout-logic.js).
//
// Pure on purpose: no React, no React Native, no Supabase. Time is passed in
// (`now`) instead of read, so every rule is a plain unit test
// (lib/workoutSession.test.ts). lib/useWorkoutSession.ts wraps it in a hook.
//
// The DB write is NOT here per set: logging a set only changes this state.
// saveRows() turns the finished session into the same rows the existing
// "complete" mutation already writes (set_logs, exercise_adjustments).
//
// Room for roadmap V17 (DESIGN.md §6.3): nothing here knows who the client is.
// The caller loads `last` and `history` for the workout's subject explicitly.

import { detectPRs, type SetPerf } from "./pr";

export const WEIGHT_STEP = 2.5;
export const REST_STEP_SECONDS = 15;
export const DEFAULT_REST_SECONDS = 60;
/** Stepper start when neither the template nor history says anything. */
export const DEFAULT_REPS = 10;

export type SessionExercise = {
  exerciseId: string;
  name: string;
  /** template_exercises.target_sets (≥ 1). */
  sets: number;
  targetReps: number | null;
  targetWeight: number | null;
  restSeconds: number | null;
  /** The subject's most recent set of this exercise, or null. */
  last: { weight: number | null; reps: number | null } | null;
  /** Every past set of this exercise for this subject — the PR baseline. */
  history: SetPerf[];
};

export type LoggedSet = { weight: number | null; reps: number; pr: boolean };

export type Adjustment =
  | { type: "skip"; reason: string }
  | {
      type: "swap";
      reason: string;
      exerciseId: string;
      name: string;
      /** The substitute's starting numbers. */
      weight: number | null;
      reps: number;
    };

export type Position = { ex: number; set: number };

export type RestState = {
  /** Absolute end (ms epoch) — right after a background or a lock screen. */
  endsAt: number;
  totalMs: number;
  /** Set while paused: the time that was left. */
  pausedLeftMs: number | null;
};

export type WorkoutState = {
  exercises: SessionExercise[];
  screen: "set" | "rest" | "finish";
  /** The exercise on screen. */
  ex: number;
  /** The stepper values. null weight = bodyweight. */
  weight: number | null;
  reps: number;
  logs: LoggedSet[][];
  adjustments: (Adjustment | null)[];
  rest: RestState | null;
  /** Where "rest over" lands. */
  next: Position | null;
  /** The set just logged, for "עריכה" (undo) on the rest screen. */
  lastLog: (Position & { weight: number | null; reps: number }) | null;
  /** Auto rest off (D20h): the rest the user may start by hand. */
  restOfferSeconds: number | null;
  startedAt: number;
  /** When the last rest ended on its own — the screen flashes / toasts. */
  restEndedAt: number | null;
};

export type WorkoutAction =
  | { type: "weight"; delta: number }
  | { type: "reps"; delta: number }
  | { type: "logSet"; now: number; autoRest?: boolean }
  | { type: "undo" }
  | { type: "startRest"; now: number }
  | { type: "restAdjust"; seconds: number; now: number }
  | { type: "restPause"; now: number }
  | { type: "restResume"; now: number }
  /** Rest reached 0 (`natural`) or the user skipped it. */
  | { type: "restDone"; now: number; natural?: boolean }
  | { type: "jump"; ex: number }
  | { type: "skip"; reason: string }
  | {
      type: "swap";
      reason: string;
      exerciseId: string;
      name: string;
      weight: number | null;
      reps: number;
    }
  | { type: "finishNow" };

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Rule 1: weight = the higher of last time and the template target (null
 * when neither exists = bodyweight); reps = target, else last time. */
export function prefill(e: SessionExercise): { weight: number | null; reps: number } {
  const candidates = [e.last?.weight, e.targetWeight].filter((w): w is number => w != null);
  return {
    weight: candidates.length ? Math.max(...candidates) : null,
    reps: e.targetReps ?? e.last?.reps ?? DEFAULT_REPS,
  };
}

export function restSecondsOf(e: SessionExercise): number {
  return e.restSeconds != null && e.restSeconds > 0 ? e.restSeconds : DEFAULT_REST_SECONDS;
}

function isOpen(exercises: SessionExercise[], logs: LoggedSet[][], adj: (Adjustment | null)[], i: number) {
  return adj[i]?.type !== "skip" && logs[i].length < exercises[i].sets;
}

/** Rule 5: the current exercise if it still has sets, else the next open one
 * after it (wrapping), skipping skipped and finished ones. null = all done. */
export function nextOpen(
  exercises: SessionExercise[],
  logs: LoggedSet[][],
  adj: (Adjustment | null)[],
  from: number,
): Position | null {
  for (let k = 0; k < exercises.length; k++) {
    const i = (from + k) % exercises.length;
    if (isOpen(exercises, logs, adj, i)) return { ex: i, set: logs[i].length };
  }
  return null;
}

function startingNumbers(s: WorkoutState, ex: number) {
  const a = s.adjustments[ex];
  if (a?.type === "swap") return { weight: a.weight, reps: a.reps };
  return prefill(s.exercises[ex]);
}

/** Move to a position. Same exercise keeps the numbers just logged; another
 * exercise starts from its pre-fill. */
function goTo(s: WorkoutState, pos: Position): WorkoutState {
  const same = pos.ex === s.ex;
  const nums = same ? { weight: s.weight, reps: s.reps } : startingNumbers(s, pos.ex);
  return {
    ...s,
    screen: "set",
    ex: pos.ex,
    weight: nums.weight,
    reps: nums.reps,
    rest: null,
    next: null,
    lastLog: null,
  };
}

/** Rule 6: is this new set a PR against the history plus this session's
 * earlier sets of the same exercise? A swapped exercise has no loaded
 * history, so it never shows a live trophy (the save still computes is_pr). */
function livePr(s: WorkoutState, ex: number, set: { weight: number | null; reps: number }): boolean {
  if (s.adjustments[ex]?.type === "swap") return false;
  const flags = detectPRs(s.exercises[ex].history, [...s.logs[ex], set]);
  return flags[flags.length - 1] ?? false;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function createSession(exercises: SessionExercise[], now: number): WorkoutState {
  const logs = exercises.map(() => [] as LoggedSet[]);
  const adjustments = exercises.map(() => null);
  const first = exercises.length ? prefill(exercises[0]) : { weight: null, reps: DEFAULT_REPS };
  return {
    exercises,
    screen: exercises.length ? "set" : "finish",
    ex: 0,
    weight: first.weight,
    reps: first.reps,
    logs,
    adjustments,
    rest: null,
    next: null,
    lastLog: null,
    restOfferSeconds: null,
    startedAt: now,
    restEndedAt: null,
  };
}

export function workoutReducer(s: WorkoutState, a: WorkoutAction): WorkoutState {
  switch (a.type) {
    case "weight": {
      if (s.weight == null) return s;
      return { ...s, weight: Math.max(0, round1(s.weight + a.delta)) };
    }
    case "reps":
      return { ...s, reps: Math.max(1, s.reps + a.delta) };

    case "logSet": {
      if (s.screen !== "set") return s;
      const set = { weight: s.weight, reps: s.reps };
      const pr = livePr(s, s.ex, set);
      const logs = s.logs.map((l, i) => (i === s.ex ? [...l, { ...set, pr }] : l));
      const lastLog = { ex: s.ex, set: s.logs[s.ex].length, ...set };
      const next = nextOpen(s.exercises, logs, s.adjustments, s.ex);
      // Last set of the whole workout: straight to Finish, no rest.
      if (!next) return { ...s, logs, lastLog, screen: "finish", rest: null, next: null, restOfferSeconds: null };
      const seconds = restSecondsOf(s.exercises[s.ex]);
      if (a.autoRest === false) {
        return { ...goTo({ ...s, logs }, next), restOfferSeconds: seconds };
      }
      return {
        ...s,
        logs,
        lastLog,
        screen: "rest",
        next,
        restOfferSeconds: null,
        rest: { endsAt: a.now + seconds * 1000, totalMs: seconds * 1000, pausedLeftMs: null },
      };
    }

    case "undo": {
      // "עריכה" on the rest screen: back to that set with its numbers.
      const l = s.lastLog;
      if (!l) return s;
      const logs = s.logs.map((x, i) => (i === l.ex ? x.slice(0, -1) : x));
      return {
        ...s,
        logs,
        screen: "set",
        ex: l.ex,
        weight: l.weight,
        reps: l.reps,
        rest: null,
        next: null,
        lastLog: null,
      };
    }

    case "startRest": {
      if (s.restOfferSeconds == null || s.screen !== "set") return s;
      const ms = s.restOfferSeconds * 1000;
      return {
        ...s,
        screen: "rest",
        next: { ex: s.ex, set: s.logs[s.ex].length },
        rest: { endsAt: a.now + ms, totalMs: ms, pausedLeftMs: null },
        restOfferSeconds: null,
      };
    }

    case "restAdjust": {
      if (!s.rest) return s;
      const left = restLeftMs(s, a.now) + a.seconds * 1000;
      const nextLeft = Math.max(1000, left);
      const rest: RestState = s.rest.pausedLeftMs != null
        ? { ...s.rest, pausedLeftMs: nextLeft }
        : { ...s.rest, endsAt: a.now + nextLeft };
      return { ...s, rest: { ...rest, totalMs: Math.max(s.rest.totalMs, nextLeft) } };
    }

    case "restPause":
      if (!s.rest || s.rest.pausedLeftMs != null) return s;
      return { ...s, rest: { ...s.rest, pausedLeftMs: restLeftMs(s, a.now) } };

    case "restResume":
      if (!s.rest || s.rest.pausedLeftMs == null) return s;
      return { ...s, rest: { ...s.rest, endsAt: a.now + s.rest.pausedLeftMs, pausedLeftMs: null } };

    case "restDone": {
      if (s.screen !== "rest" || !s.next) return s;
      return { ...goTo(s, s.next), restEndedAt: a.natural ? a.now : null };
    }

    case "jump": {
      // Rule 8: any unfinished, unskipped exercise; its logs stay.
      if (a.ex < 0 || a.ex >= s.exercises.length) return s;
      if (!isOpen(s.exercises, s.logs, s.adjustments, a.ex)) return s;
      return goTo(s, { ex: a.ex, set: s.logs[a.ex].length });
    }

    case "skip": {
      const adjustments = s.adjustments.map((x, i) => (i === s.ex ? { type: "skip" as const, reason: a.reason } : x));
      const next = nextOpen(s.exercises, s.logs, adjustments, s.ex);
      if (!next) return { ...s, adjustments, screen: "finish", rest: null, next: null };
      return goTo({ ...s, adjustments }, next);
    }

    case "swap": {
      // Rule 7: the substitute's sets log against it; its numbers start fresh.
      const adjustments = s.adjustments.map((x, i) =>
        i === s.ex
          ? {
              type: "swap" as const,
              reason: a.reason,
              exerciseId: a.exerciseId,
              name: a.name,
              weight: a.weight,
              reps: a.reps,
            }
          : x,
      );
      return { ...s, adjustments, weight: a.weight, reps: a.reps };
    }

    case "finishNow":
      return { ...s, screen: "finish", rest: null, next: null };
  }
}

// ---------------------------------------------------------------------------
// Read-outs for the screens
// ---------------------------------------------------------------------------

export function restLeftMs(s: WorkoutState, now: number): number {
  if (!s.rest) return 0;
  if (s.rest.pausedLeftMs != null) return s.rest.pausedLeftMs;
  return Math.max(0, s.rest.endsAt - now);
}

export function exerciseName(s: WorkoutState, i: number): string {
  const a = s.adjustments[i];
  return a?.type === "swap" ? a.name : s.exercises[i].name;
}

export function isSwapped(s: WorkoutState, i: number): boolean {
  return s.adjustments[i]?.type === "swap";
}

/** Progress segments: fraction of sets done; skipped exercises show full in ash. */
export function progress(s: WorkoutState): { fraction: number; skipped: boolean }[] {
  return s.exercises.map((e, i) => {
    const skipped = s.adjustments[i]?.type === "skip";
    return { skipped, fraction: skipped ? 1 : Math.min(1, s.logs[i].length / e.sets) };
  });
}

export type Pill =
  | { status: "done"; index: number; weight: number | null; reps: number; pr: boolean }
  | { status: "now" | "todo"; index: number };

export function pills(s: WorkoutState): Pill[] {
  const e = s.exercises[s.ex];
  const logs = s.logs[s.ex];
  return Array.from({ length: e.sets }, (_, i): Pill => {
    if (i < logs.length) return { status: "done", index: i, ...logs[i] };
    return { status: i === logs.length ? "now" : "todo", index: i };
  });
}

/** The "{trainer} raised the target to X" line: first set of an exercise the
 * trainer set heavier than last time, while the stepper still shows it. */
export function raisedTarget(s: WorkoutState): number | null {
  const e = s.exercises[s.ex];
  if (isSwapped(s, s.ex) || s.logs[s.ex].length > 0) return null;
  const last = e.last?.weight;
  if (e.targetWeight == null || last == null || e.targetWeight <= last) return null;
  return s.weight === e.targetWeight ? e.targetWeight : null;
}

/** True when logging the set on screen ends the workout (no rest follows). */
export function isLastSetOverall(s: WorkoutState): boolean {
  const logs = s.logs.map((l, i) => (i === s.ex ? [...l, { weight: null, reps: 0, pr: false }] : l));
  return nextOpen(s.exercises, logs, s.adjustments, s.ex) == null;
}

export function setsLogged(s: WorkoutState): number {
  return s.logs.reduce((n, l) => n + l.length, 0);
}

/** One entry per exercise with a live PR: its best PR set (for Finish). */
export function sessionPrs(s: WorkoutState): { name: string; weight: number; reps: number }[] {
  const out: { name: string; weight: number; reps: number }[] = [];
  s.logs.forEach((logs, i) => {
    const hits = logs.filter((l) => l.pr && l.weight != null);
    const best = hits[hits.length - 1];
    if (best) out.push({ name: exerciseName(s, i), weight: best.weight!, reps: best.reps });
  });
  return out;
}

/** The rows the existing complete mutation writes. Swaps log against the
 * substitute; a skipped exercise has no sets. set_index restarts per exercise. */
export function saveRows(s: WorkoutState): {
  sets: { exercise_id: string; set_index: number; reps: number; weight: number | null }[];
  adjustments: {
    exercise_id: string;
    action: "skipped" | "swapped";
    swapped_for_exercise_id: string | null;
    reason: string | null;
  }[];
} {
  const sets = s.exercises.flatMap((e, i) => {
    const a = s.adjustments[i];
    if (a?.type === "skip") return [];
    const exerciseId = a?.type === "swap" ? a.exerciseId : e.exerciseId;
    return s.logs[i].map((l, idx) => ({ exercise_id: exerciseId, set_index: idx, reps: l.reps, weight: l.weight }));
  });
  const adjustments = s.exercises.flatMap((e, i) => {
    const a = s.adjustments[i];
    if (!a) return [];
    return [
      {
        exercise_id: e.exerciseId,
        action: a.type === "skip" ? ("skipped" as const) : ("swapped" as const),
        swapped_for_exercise_id: a.type === "swap" ? a.exerciseId : null,
        reason: a.reason.trim() === "" ? null : a.reason.trim(),
      },
    ];
  });
  return { sets, adjustments };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 42.5 → "42.5", 40 → "40". */
export function formatWeight(w: number): string {
  return Number.isInteger(round1(w)) ? String(Math.round(w)) : round1(w).toFixed(1);
}

/** ms → "1:30" (rounded up, so a timer never shows 0:00 while running). */
export function formatClock(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** ms → "18:40" / "1:05:12" for the elapsed workout time. */
export function formatElapsed(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

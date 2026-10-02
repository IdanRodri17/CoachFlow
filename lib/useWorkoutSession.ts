// lib/useWorkoutSession.ts — the workout mode as a React hook (D20a).
//
// The rules live in lib/workoutSession.ts (pure, unit-tested). This hook only
// adds a clock: `now` ticks 4×/s while resting (smooth ring) and 1×/s
// otherwise (elapsed time), and a rest that reaches 0 ends by itself.
//
// Still to come, each in its own step: keep-awake and rest-end alerts (D20f),
// persisting an open session across restarts (D20g), the workout settings
// (D20h). Loading the exercises — with "last time" and the PR history read for
// the workout's subject explicitly (DESIGN.md §6.3) — happens in
// app/workout/[id].tsx when the screen is wired in.

import { useEffect, useMemo, useReducer, useState } from "react";

import {
  createSession,
  REST_STEP_SECONDS,
  WEIGHT_STEP,
  workoutReducer,
  type SessionExercise,
  type WorkoutState,
} from "./workoutSession";

export type WorkoutSession = ReturnType<typeof useWorkoutSession>;

export function useWorkoutSession(exercises: SessionExercise[], options: { autoRest?: boolean } = {}) {
  const [state, dispatch] = useReducer(workoutReducer, exercises, (ex) => createSession(ex, Date.now()));
  const [now, setNow] = useState(() => Date.now());

  const resting = state.screen === "rest";
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), resting ? 250 : 1000);
    return () => clearInterval(id);
  }, [resting]);

  // A running rest that reaches 0 lands on the next set on its own.
  useEffect(() => {
    if (state.screen === "rest" && state.rest && state.rest.pausedLeftMs == null && now >= state.rest.endsAt) {
      dispatch({ type: "restDone", now, natural: true });
    }
  }, [now, state.screen, state.rest]);

  const actions = useMemo(
    () => ({
      weightDown: () => dispatch({ type: "weight", delta: -WEIGHT_STEP }),
      weightUp: () => dispatch({ type: "weight", delta: WEIGHT_STEP }),
      repsDown: () => dispatch({ type: "reps", delta: -1 }),
      repsUp: () => dispatch({ type: "reps", delta: 1 }),
      logSet: () => dispatch({ type: "logSet", now: Date.now(), autoRest: options.autoRest }),
      undo: () => dispatch({ type: "undo" }),
      startRest: () => dispatch({ type: "startRest", now: Date.now() }),
      restMinus: () => dispatch({ type: "restAdjust", seconds: -REST_STEP_SECONDS, now: Date.now() }),
      restPlus: () => dispatch({ type: "restAdjust", seconds: REST_STEP_SECONDS, now: Date.now() }),
      togglePause: (s: WorkoutState) =>
        dispatch({ type: s.rest?.pausedLeftMs != null ? "restResume" : "restPause", now: Date.now() }),
      skipRest: () => dispatch({ type: "restDone", now: Date.now() }),
      jump: (ex: number) => dispatch({ type: "jump", ex }),
      skip: (reason: string) => dispatch({ type: "skip", reason }),
      swap: (sub: { reason: string; exerciseId: string; name: string; weight: number | null; reps: number }) =>
        dispatch({ type: "swap", ...sub }),
      finishNow: () => dispatch({ type: "finishNow" }),
    }),
    [options.autoRest],
  );

  return { state, now, ...actions };
}

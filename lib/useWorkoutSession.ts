// lib/useWorkoutSession.ts — the workout mode as a React hook (D20a), plus the
// two functions that touch the database: loadWorkout() and saveWorkout().
//
// The rules live in lib/workoutSession.ts (pure, unit-tested). This hook only
// adds a clock: `now` ticks 4×/s while resting (smooth ring) and 1×/s
// otherwise (elapsed time), and a rest that reaches 0 ends by itself.
//
// Room for roadmap V17's trainer mode (DESIGN.md §6.3): the hook takes the
// workout's `subject` and who is logging it (`loggedBy`) as inputs and never
// reads the signed-in user as "the client". "Last time" and the PR history are
// read for the subject explicitly (set_logs filtered through
// workout_logs.client_id), not left to RLS — for a trainer, RLS returns every
// client's sets. Only `mode: "client"` (subject = an app client) is built;
// V17 changes the subject filter and the insert in these two functions.
//
// Phone-free (D20f): the screen stays awake during the workout and a rest
// that ends buzzes in the foreground or notifies in the background
// (lib/restAlerts.ts), both per the client's lib/workoutPrefs.ts settings.
// Resume (D20g): the open session is saved on the phone after every change,
// keyed `${loggedBy}:${scheduledId}` (a trainer can have several open), so
// minimizing or an app restart loses nothing; the save clears it.

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";

import i18next from "./i18n";
import { cancelRestAlert, restEndHaptic, scheduleRestAlert } from "./restAlerts";
import { supabase } from "./supabase";
import { detectPRs, type SetPerf } from "./pr";
import { checkAndAwardBadges } from "./badges";
import {
  createSession,
  exerciseName,
  fromSaved,
  isPristine,
  REST_STEP_SECONDS,
  RESUME_MAX_AGE_MS,
  saveRows,
  toSaved,
  workoutReducer,
  type SavedSession,
  type SessionExercise,
  type WorkoutState,
} from "./workoutSession";

export type WorkoutSubject = { kind: "app" | "managed"; id: string };
export type WorkoutMode = "client" | "trainer";

/** SessionExercise plus what the screens show around it. */
export type LoadedExercise = SessionExercise & { muscleGroup: string | null; videoUrl: string | null };

export type WorkoutData = {
  scheduledId: string;
  trainerId: string;
  scheduledDate: string;
  status: "scheduled" | "completed";
  note: string | null;
  /** The template's name, or null for a free workout. */
  title: string | null;
  exercises: LoadedExercise[];
};

export type WorkoutSession = ReturnType<typeof useWorkoutSession>;

const KEEP_AWAKE_TAG = "workout";
const SAVED_PREFIX = "coachflow.workout:";
const savedKey = (loggedBy: string, scheduledId: string) => `${SAVED_PREFIX}${loggedBy}:${scheduledId}`;
const alertKey = (loggedBy: string, scheduledId: string) => `${loggedBy}:${scheduledId}`;

export function useWorkoutSession({
  scheduledId,
  title,
  exercises,
  subject,
  loggedBy,
  mode,
  restored,
  autoRest,
  restAlerts,
  keepAwake,
}: {
  scheduledId: string;
  /** The workout's name, saved with the session for Today's "חזרה לאימון" card. */
  title: string;
  exercises: SessionExercise[];
  subject: WorkoutSubject;
  loggedBy: string;
  mode: WorkoutMode;
  /** A saved open session to resume (loadSavedWorkout), else a fresh start. */
  restored?: WorkoutState | null;
  autoRest?: boolean;
  restAlerts?: boolean;
  keepAwake?: boolean;
}) {
  const [state, dispatch] = useReducer(workoutReducer, null, () => restored ?? createSession(exercises, Date.now()));
  const [now, setNow] = useState(() => Date.now());

  // D20g: saved after every change; nothing to resume yet → nothing stored.
  useEffect(() => {
    const key = savedKey(loggedBy, scheduledId);
    if (isPristine(state)) void AsyncStorage.removeItem(key).catch(() => undefined);
    else void AsyncStorage.setItem(key, JSON.stringify({ ...toSaved(state), title })).catch(() => undefined);
  }, [state, loggedBy, scheduledId, title]);

  // D20f: the screen stays on while the workout is open.
  useEffect(() => {
    if (!keepAwake) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [keepAwake]);

  // D20f: a running rest has a notification at its end; any change to the
  // rest (±15, pause, skip, undo, finish) moves or cancels it. Not on
  // unmount: a minimized workout still buzzes when its rest ends.
  const rest = state.rest;
  const alertBody = state.next
    ? i18next.t("workout.alerts.restOverBody", {
        n: state.next.set + 1,
        name: exerciseName(state, state.next.ex),
      })
    : "";
  useEffect(() => {
    const key = alertKey(loggedBy, scheduledId);
    if (!restAlerts || !rest || rest.pausedLeftMs != null) void cancelRestAlert(key);
    else void scheduleRestAlert(key, rest.endsAt, alertBody);
  }, [rest, restAlerts, alertBody, loggedBy, scheduledId]);

  // D20f: the foreground buzz when a rest runs out (not for one that ended
  // before this screen opened — that's the resumed state's old stamp).
  const buzzedFor = useRef(state.restEndedAt);
  useEffect(() => {
    if (state.restEndedAt == null || state.restEndedAt === buzzedFor.current) return;
    buzzedFor.current = state.restEndedAt;
    if (restAlerts) restEndHaptic();
  }, [state.restEndedAt, restAlerts]);

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
      weightDown: () => dispatch({ type: "weightStep", dir: -1 }),
      weightUp: () => dispatch({ type: "weightStep", dir: 1 }),
      setWeight: (value: number) => dispatch({ type: "setWeight", value }),
      repsDown: () => dispatch({ type: "reps", delta: -1 }),
      repsUp: () => dispatch({ type: "reps", delta: 1 }),
      setReps: (value: number) => dispatch({ type: "setReps", value }),
      logSet: () => dispatch({ type: "logSet", now: Date.now(), autoRest }),
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
    [autoRest],
  );

  return { state, now, scheduledId, subject, loggedBy, mode, ...actions };
}

/** The saved open session for this workout, if it still fits these exercises. */
export async function loadSavedWorkout(
  loggedBy: string,
  scheduledId: string,
  exercises: SessionExercise[],
): Promise<WorkoutState | null> {
  try {
    const raw = await AsyncStorage.getItem(savedKey(loggedBy, scheduledId));
    if (!raw) return null;
    const state = fromSaved(JSON.parse(raw), exercises, Date.now());
    if (!state) await AsyncStorage.removeItem(savedKey(loggedBy, scheduledId));
    return state;
  } catch {
    return null;
  }
}

export type OpenWorkout = { scheduledId: string; title: string; startedAt: number; minutesAgo: number; sets: number };

/** The open (saved, not yet finished) workouts on this phone for this user,
 * newest first — Today's "חזרה לאימון" card. Stale ones are dropped. */
export async function listOpenWorkouts(loggedBy: string): Promise<OpenWorkout[]> {
  try {
    const prefix = `${SAVED_PREFIX}${loggedBy}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
    if (keys.length === 0) return [];
    const open: OpenWorkout[] = [];
    for (const [key, raw] of await AsyncStorage.multiGet(keys)) {
      const saved = raw ? (JSON.parse(raw) as Partial<SavedSession> & { title?: string }) : null;
      if (!saved || saved.v !== 1 || typeof saved.startedAt !== "number" || Date.now() - saved.startedAt > RESUME_MAX_AGE_MS) {
        await AsyncStorage.removeItem(key);
        continue;
      }
      open.push({
        scheduledId: key.slice(prefix.length),
        title: saved.title ?? "",
        startedAt: saved.startedAt,
        minutesAgo: Math.max(1, Math.round((Date.now() - saved.startedAt) / 60_000)),
        sets: (saved.logs ?? []).reduce((n, l) => n + l.length, 0),
      });
    }
    return open.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

/** Forget an open session: after the save, or when the workout is already done. */
export async function clearSavedWorkout(loggedBy: string, scheduledId: string): Promise<void> {
  await cancelRestAlert(alertKey(loggedBy, scheduledId));
  await AsyncStorage.removeItem(savedKey(loggedBy, scheduledId)).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

type HistoryRow = SetPerf & { exerciseId: string };

/** Every past set of these exercises for the subject, newest first. */
export async function subjectHistory(exerciseIds: string[], subject: WorkoutSubject): Promise<HistoryRow[]> {
  if (exerciseIds.length === 0) return [];
  if (subject.kind !== "app") throw new Error("Logging for an offline client isn't built yet (roadmap V17).");
  const { data, error } = await supabase
    .from("set_logs")
    .select("exercise_id, weight, reps, set_index, workout_logs!inner(client_id, completed_at)")
    .in("exercise_id", exerciseIds)
    .eq("workout_logs.client_id", subject.id);
  if (error) throw error;
  return data
    .map((row) => ({
      exerciseId: row.exercise_id,
      weight: row.weight,
      reps: row.reps,
      setIndex: row.set_index,
      completedAt: (row.workout_logs as unknown as { completed_at: string }).completed_at,
    }))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.setIndex - a.setIndex)
    .map(({ exerciseId, weight, reps }) => ({ exerciseId, weight, reps }));
}

/** The scheduled workout and its exercises, with "last time" (the subject's
 * most recent set) and the PR baseline per exercise. */
export async function loadWorkout(
  scheduledId: string,
  subject: WorkoutSubject,
  fallbackName: string,
): Promise<WorkoutData> {
  const { data: sw, error } = await supabase.from("scheduled_workouts").select("*").eq("id", scheduledId).single();
  if (error) throw error;

  const base = {
    scheduledId,
    trainerId: sw.trainer_id,
    scheduledDate: sw.scheduled_date,
    status: sw.status,
    note: sw.notes,
  };
  if (!sw.template_id) return { ...base, title: null, exercises: [] };

  const [tplRes, teRes] = await Promise.all([
    supabase.from("workout_templates").select("name").eq("id", sw.template_id).maybeSingle(),
    supabase.from("template_exercises").select("*").eq("template_id", sw.template_id).order("position"),
  ]);
  if (teRes.error) throw teRes.error;
  const tes = teRes.data;
  const exIds = [...new Set(tes.map((te) => te.exercise_id))];

  const info = new Map<string, { name: string; muscleGroup: string | null; videoUrl: string | null }>();
  if (exIds.length > 0) {
    const { data: exs, error: exErr } = await supabase
      .from("exercises")
      .select("id, name, muscle_group, video_url")
      .in("id", exIds);
    if (exErr) throw exErr;
    exs.forEach((e) => info.set(e.id, { name: e.name, muscleGroup: e.muscle_group, videoUrl: e.video_url }));
  }
  const history = await subjectHistory(exIds, subject);

  const exercises: LoadedExercise[] = tes.map((te) => {
    const sets = history.filter((h) => h.exerciseId === te.exercise_id);
    const ex = info.get(te.exercise_id);
    return {
      exerciseId: te.exercise_id,
      name: ex?.name ?? fallbackName,
      muscleGroup: ex?.muscleGroup ?? null,
      videoUrl: ex?.videoUrl ?? null,
      sets: te.target_sets && te.target_sets > 0 ? te.target_sets : 1,
      targetReps: te.target_reps,
      targetWeight: te.target_weight,
      restSeconds: te.rest_seconds,
      last: sets[0] ? { weight: sets[0].weight, reps: sets[0].reps } : null,
      history: sets.map(({ weight, reps }) => ({ weight, reps })),
    };
  });
  return { ...base, title: tplRes.data?.name ?? null, exercises };
}

/** The one save: the workout log (+ effort and note), its sets with PR flags,
 * the skips and swaps, the scheduled workout marked completed, and (client
 * mode) badges. Swaps log against the substitute. */
export async function saveWorkout(
  session: Pick<WorkoutSession, "state" | "scheduledId" | "subject" | "loggedBy" | "mode">,
  { durationSeconds, effort, note }: { durationSeconds: number | null; effort: number | null; note: string | null },
): Promise<void> {
  const { state, scheduledId, subject, loggedBy, mode } = session;
  if (subject.kind !== "app") throw new Error("Logging for an offline client isn't built yet (roadmap V17).");
  const rows = saveRows(state);

  // PR flags against the subject's own history (lib/pr.ts) — the same rule
  // the live trophies use, recomputed here because a swap has no history.
  const exIds = [...new Set(rows.sets.map((r) => r.exercise_id))];
  const history = await subjectHistory(exIds, subject);
  const isPr = new Array<boolean>(rows.sets.length).fill(false);
  exIds.forEach((exId) => {
    const idxs = rows.sets.flatMap((r, i) => (r.exercise_id === exId ? [i] : []));
    const flags = detectPRs(
      history.filter((h) => h.exerciseId === exId),
      idxs.map((i) => ({ weight: rows.sets[i].weight, reps: rows.sets[i].reps })),
    );
    idxs.forEach((i, k) => (isPr[i] = flags[k]));
  });

  const { data: log, error: logErr } = await supabase
    .from("workout_logs")
    .insert({
      scheduled_workout_id: scheduledId,
      client_id: subject.id,
      duration_seconds: durationSeconds,
      effort_rating: effort,
      client_note: note,
    })
    .select("id")
    .single();
  if (logErr) throw logErr;

  if (rows.sets.length > 0) {
    const { error } = await supabase
      .from("set_logs")
      .insert(rows.sets.map((r, i) => ({ ...r, workout_log_id: log.id, is_pr: isPr[i] })));
    if (error) throw error;
  }
  if (rows.adjustments.length > 0) {
    const { error } = await supabase
      .from("exercise_adjustments")
      .insert(rows.adjustments.map((a) => ({ ...a, workout_log_id: log.id })));
    if (error) throw error;
  }

  const { error: swErr } = await supabase.from("scheduled_workouts").update({ status: "completed" }).eq("id", scheduledId);
  if (swErr) throw swErr;

  // Saved: nothing left to resume.
  await clearSavedWorkout(loggedBy, scheduledId);

  // Badges (V9) are the client's own — deterministic, from client_streaks.
  if (mode === "client") await checkAndAwardBadges(subject.id);
}

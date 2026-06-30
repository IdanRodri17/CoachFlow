// app/workout/[id].tsx — the active-workout / logging screen (route /workout/:id,
// where :id is a scheduled_workout id). Client-only.
//
// Shows the trainer's note, then each exercise with its "last time" numbers and
// targets, editable set rows (reps × weight, pre-filled with last time), a rest
// button, and a per-exercise Skip / Swap menu (V5b). "Complete workout" writes
// the workout_log + set_logs (+ exercise_adjustments) and flips the scheduled
// workout to 'completed'. A completed workout opens a read-only summary.

import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, toDateString } from "@/lib/dates";
import { RestTimer } from "@/components/RestTimer";
import { AdjustmentModal, type AdjustmentResult } from "@/components/AdjustmentModal";

type SessionExercise = {
  exerciseId: string;
  name: string;
  targetSets: number | null;
  targetReps: number | null;
  targetWeight: number | null;
  restSeconds: number | null;
  lastTime: { weight: number | null; reps: number | null } | null;
};
type SessionData = {
  note: string | null;
  status: "scheduled" | "completed";
  hasTemplate: boolean;
  exercises: SessionExercise[];
};

const toInt = (v: string) => {
  const n = Number.parseInt(v.trim(), 10);
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};
const toNum = (v: string) => {
  const n = Number.parseFloat(v.trim());
  return v.trim() === "" || !Number.isFinite(n) ? null : n;
};

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, session } = useAuth();

  // Only clients log workouts.
  if (profile && profile.role !== "client") return <Redirect href="/" />;

  const query = useQuery({
    queryKey: ["workout-session", id],
    queryFn: async (): Promise<SessionData> => {
      const { data: sw, error } = await supabase
        .from("scheduled_workouts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;

      let exercises: SessionExercise[] = [];
      if (sw.template_id) {
        const { data: tes, error: teErr } = await supabase
          .from("template_exercises")
          .select("*")
          .eq("template_id", sw.template_id)
          .order("position");
        if (teErr) throw teErr;

        const exIds = tes.map((t) => t.exercise_id);
        const nameMap = new Map<string, string>();
        const lastMap = new Map<string, { weight: number | null; reps: number | null }>();
        if (exIds.length > 0) {
          const { data: exs } = await supabase.from("exercises").select("id, name").in("id", exIds);
          exs?.forEach((e) => nameMap.set(e.id, e.name));
          const { data: sls } = await supabase
            .from("set_logs")
            .select("exercise_id, reps, weight, created_at")
            .in("exercise_id", exIds)
            .order("created_at", { ascending: false });
          sls?.forEach((s) => {
            if (!lastMap.has(s.exercise_id)) lastMap.set(s.exercise_id, { weight: s.weight, reps: s.reps });
          });
        }

        exercises = tes.map((t) => ({
          exerciseId: t.exercise_id,
          name: nameMap.get(t.exercise_id) ?? "Exercise",
          targetSets: t.target_sets,
          targetReps: t.target_reps,
          targetWeight: t.target_weight,
          restSeconds: t.rest_seconds,
          lastTime: lastMap.get(t.exercise_id) ?? null,
        }));
      }

      return { note: sw.notes, status: sw.status, hasTemplate: !!sw.template_id, exercises };
    },
  });

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }
  if (query.error || !query.data) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-sm text-red-600">
          {query.error ? (query.error as Error).message : "Workout not found."}
        </Text>
      </View>
    );
  }

  if (query.data.status === "completed") {
    return <CompletedSummary scheduledId={id} note={query.data.note} />;
  }

  return <LoggingSession scheduledId={id} clientId={session!.user.id} data={query.data} />;
}

// ---------------------------------------------------------------------------
// Completed summary (read-only)
// ---------------------------------------------------------------------------
type LoggedSet = { set_index: number; reps: number | null; weight: number | null; is_pr: boolean };
type LoggedGroup = { exerciseId: string; name: string; sets: LoggedSet[] };
type Adj = { action: "skipped" | "swapped"; exerciseName: string; swapName: string | null; reason: string | null };

function CompletedSummary({ scheduledId, note }: { scheduledId: string; note: string | null }) {
  const query = useQuery({
    queryKey: ["workout-summary", scheduledId],
    queryFn: async () => {
      const { data: log, error } = await supabase
        .from("workout_logs")
        .select("*")
        .eq("scheduled_workout_id", scheduledId)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!log) return { log: null, groups: [] as LoggedGroup[], adjustments: [] as Adj[] };

      const [setsRes, adjRes] = await Promise.all([
        supabase.from("set_logs").select("*").eq("workout_log_id", log.id).order("set_index"),
        supabase.from("exercise_adjustments").select("*").eq("workout_log_id", log.id),
      ]);
      if (setsRes.error) throw setsRes.error;
      if (adjRes.error) throw adjRes.error;
      const sets = setsRes.data ?? [];
      const adjustmentsRaw = adjRes.data ?? [];

      // Names for every exercise referenced (sets + adjustments).
      const exIds = [
        ...new Set([
          ...sets.map((s) => s.exercise_id),
          ...adjustmentsRaw.map((a) => a.exercise_id),
          ...adjustmentsRaw.map((a) => a.swapped_for_exercise_id).filter(Boolean) as string[],
        ]),
      ];
      const nameMap = new Map<string, string>();
      if (exIds.length > 0) {
        const { data: exs } = await supabase.from("exercises").select("id, name").in("id", exIds);
        exs?.forEach((e) => nameMap.set(e.id, e.name));
      }

      const order: string[] = [];
      const byEx = new Map<string, LoggedSet[]>();
      for (const s of sets) {
        if (!byEx.has(s.exercise_id)) {
          byEx.set(s.exercise_id, []);
          order.push(s.exercise_id);
        }
        byEx.get(s.exercise_id)!.push({ set_index: s.set_index, reps: s.reps, weight: s.weight, is_pr: s.is_pr });
      }
      const groups: LoggedGroup[] = order.map((exId) => ({
        exerciseId: exId,
        name: nameMap.get(exId) ?? "Exercise",
        sets: byEx.get(exId)!,
      }));

      const adjustments: Adj[] = adjustmentsRaw.map((a) => ({
        action: a.action,
        exerciseName: nameMap.get(a.exercise_id) ?? "Exercise",
        swapName: a.swapped_for_exercise_id ? nameMap.get(a.swapped_for_exercise_id) ?? "Exercise" : null,
        reason: a.reason,
      }));

      return { log, groups, adjustments };
    },
  });

  if (query.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const log = query.data?.log ?? null;
  const groups = query.data?.groups ?? [];
  const adjustments = query.data?.adjustments ?? [];

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6">
        <View className="mb-5 items-center">
          <Text className="text-4xl">✅</Text>
          <Text className="mt-2 text-xl font-bold text-slate-900">Workout completed</Text>
          {log ? (
            <Text className="mt-1 text-sm text-slate-500">
              {formatDisplayDate(toDateString(new Date(log.completed_at)))}
              {log.duration_seconds ? ` · ${Math.max(1, Math.round(log.duration_seconds / 60))} min` : ""}
            </Text>
          ) : null}
        </View>

        {note ? (
          <View className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Note from your trainer
            </Text>
            <Text className="mt-1 text-base text-amber-900">{note}</Text>
          </View>
        ) : null}

        {groups.length === 0 && adjustments.length === 0 ? (
          <Text className="text-center text-sm text-slate-400">No sets were logged for this workout.</Text>
        ) : null}

        {groups.map((g) => (
          <View key={g.exerciseId} className="mb-3 rounded-2xl border border-slate-200 p-4">
            <Text className="text-base font-bold text-slate-900">{g.name}</Text>
            <View className="mt-2 gap-1">
              {g.sets.map((s, i) => (
                <View key={i} className="flex-row items-center justify-between">
                  <Text className="text-sm text-slate-500">Set {s.set_index + 1}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base text-slate-900">
                      {s.reps ?? "—"} reps × {s.weight ?? "—"}
                      {s.weight != null ? "kg" : ""}
                    </Text>
                    {s.is_pr ? (
                      <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                        PR
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Skips / swaps */}
        {adjustments.map((a, i) => (
          <View key={i} className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Text className="text-sm font-semibold text-slate-700">
              {a.action === "skipped"
                ? `Skipped ${a.exerciseName}`
                : `Swapped ${a.exerciseName} → ${a.swapName}`}
            </Text>
            {a.reason ? <Text className="mt-0.5 text-sm text-slate-500">“{a.reason}”</Text> : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Active logging session
// ---------------------------------------------------------------------------
type Row = { reps: string; weight: string };
type Adjustment =
  | { action: "skipped"; reason: string }
  | { action: "swapped"; reason: string; swapId: string; swapName: string };

function LoggingSession({
  scheduledId,
  clientId,
  data,
}: {
  scheduledId: string;
  clientId: string;
  data: SessionData;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const startedAt = useRef(Date.now());

  const [rows, setRows] = useState<Record<string, Row[]>>(() => {
    const initial: Record<string, Row[]> = {};
    data.exercises.forEach((ex) => {
      const count = ex.targetSets && ex.targetSets > 0 ? ex.targetSets : 1;
      const defaultReps = ex.lastTime?.reps ?? ex.targetReps;
      const defaultWeight = ex.lastTime?.weight ?? ex.targetWeight;
      initial[ex.exerciseId] = Array.from({ length: count }, () => ({
        reps: defaultReps != null ? String(defaultReps) : "",
        weight: defaultWeight != null ? String(defaultWeight) : "",
      }));
    });
    return initial;
  });
  const [activeRest, setActiveRest] = useState<number | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, Adjustment>>({});
  const [modal, setModal] = useState<{ exerciseId: string; exerciseName: string; mode: "skip" | "swap" } | null>(
    null,
  );

  // The exercise library (for the swap picker) — client reads roster-scoped.
  const library = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  function updateRow(exId: string, idx: number, field: keyof Row, value: string) {
    setRows((prev) => {
      const next = { ...prev };
      const arr = [...next[exId]];
      arr[idx] = { ...arr[idx], [field]: value };
      next[exId] = arr;
      return next;
    });
  }
  function addRow(exId: string) {
    setRows((prev) => ({ ...prev, [exId]: [...prev[exId], { reps: "", weight: "" }] }));
  }
  function undoAdjust(exId: string) {
    setAdjustments((prev) => {
      const next = { ...prev };
      delete next[exId];
      return next;
    });
  }
  function confirmAdjust(result: AdjustmentResult) {
    if (!modal) return;
    if (modal.mode === "skip") {
      setAdjustments((prev) => ({ ...prev, [modal.exerciseId]: { action: "skipped", reason: result.reason } }));
    } else if (result.swapId && result.swapName) {
      setAdjustments((prev) => ({
        ...prev,
        [modal.exerciseId]: { action: "swapped", reason: result.reason, swapId: result.swapId!, swapName: result.swapName! },
      }));
    }
    setModal(null);
  }

  const complete = useMutation({
    mutationFn: async () => {
      const duration = Math.round((Date.now() - startedAt.current) / 1000);
      const { data: log, error: logErr } = await supabase
        .from("workout_logs")
        .insert({ scheduled_workout_id: scheduledId, client_id: clientId, duration_seconds: duration })
        .select("id")
        .single();
      if (logErr) throw logErr;

      // Set logs: skip 'skipped' exercises; 'swapped' ones log against the substitute.
      const setRowsToInsert = data.exercises.flatMap((ex) => {
        const adj = adjustments[ex.exerciseId];
        if (adj?.action === "skipped") return [];
        const targetExerciseId = adj?.action === "swapped" ? adj.swapId : ex.exerciseId;
        return rows[ex.exerciseId]
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => r.reps.trim() !== "" || r.weight.trim() !== "")
          .map(({ r, idx }) => ({
            workout_log_id: log.id,
            exercise_id: targetExerciseId,
            set_index: idx,
            reps: toInt(r.reps),
            weight: toNum(r.weight),
          }));
      });
      if (setRowsToInsert.length > 0) {
        const { error: setErr } = await supabase.from("set_logs").insert(setRowsToInsert);
        if (setErr) throw setErr;
      }

      // Adjustment rows (skips + swaps).
      const adjRows = Object.entries(adjustments).map(([exerciseId, adj]) => ({
        workout_log_id: log.id,
        exercise_id: exerciseId,
        action: adj.action,
        swapped_for_exercise_id: adj.action === "swapped" ? adj.swapId : null,
        reason: adj.reason.trim() === "" ? null : adj.reason.trim(),
      }));
      if (adjRows.length > 0) {
        const { error: adjErr } = await supabase.from("exercise_adjustments").insert(adjRows);
        if (adjErr) throw adjErr;
      }

      const { error: swErr } = await supabase
        .from("scheduled_workouts")
        .update({ status: "completed" })
        .eq("id", scheduledId);
      if (swErr) throw swErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-client"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-trainer"] });
      queryClient.invalidateQueries({ queryKey: ["workout-session", scheduledId] });
      router.back();
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        {data.note ? (
          <View className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-amber-700">
              Note from your trainer
            </Text>
            <Text className="mt-1 text-base text-amber-900">{data.note}</Text>
          </View>
        ) : null}

        {!data.hasTemplate ? (
          <View className="items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
            <Text className="text-center text-base font-medium text-slate-700">Free workout</Text>
            <Text className="mt-2 text-center text-sm text-slate-400">
              No exercises listed — mark it complete when you're done.
            </Text>
          </View>
        ) : (
          data.exercises.map((ex) => {
            const adj = adjustments[ex.exerciseId];

            // Skipped → collapsed card.
            if (adj?.action === "skipped") {
              return (
                <View key={ex.exerciseId} className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-base font-semibold text-slate-400 line-through">{ex.name}</Text>
                    <Text className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      Skipped
                    </Text>
                  </View>
                  {adj.reason ? <Text className="mt-1 text-sm text-slate-500">“{adj.reason}”</Text> : null}
                  <Pressable className="mt-2 self-start" onPress={() => undoAdjust(ex.exerciseId)}>
                    <Text className="text-sm font-semibold text-slate-600">Undo</Text>
                  </Pressable>
                </View>
              );
            }

            const swapped = adj?.action === "swapped" ? adj : null;
            return (
              <View key={ex.exerciseId} className="mb-4 rounded-2xl border border-slate-200 p-4">
                <Text className="text-lg font-bold text-slate-900">{ex.name}</Text>

                {swapped ? (
                  <View className="mt-1 rounded-lg bg-slate-100 px-3 py-2">
                    <Text className="text-sm font-medium text-slate-700">Swapped → {swapped.swapName}</Text>
                    {swapped.reason ? <Text className="text-sm text-slate-500">“{swapped.reason}”</Text> : null}
                    <Pressable className="mt-1 self-start" onPress={() => undoAdjust(ex.exerciseId)}>
                      <Text className="text-sm font-semibold text-slate-600">Undo</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="mt-1 flex-row flex-wrap gap-x-4">
                    <Text className="text-sm text-slate-500">
                      Last time:{" "}
                      {ex.lastTime && (ex.lastTime.weight != null || ex.lastTime.reps != null)
                        ? `${ex.lastTime.weight ?? "—"}${ex.lastTime.weight != null ? "kg" : ""} × ${ex.lastTime.reps ?? "—"}`
                        : "—"}
                    </Text>
                    <Text className="text-sm text-slate-400">
                      Target: {ex.targetSets ?? "—"} × {ex.targetReps ?? "—"}
                      {ex.targetWeight != null ? ` @ ${ex.targetWeight}kg` : ""}
                    </Text>
                  </View>
                )}

                <View className="mt-3 gap-2">
                  {rows[ex.exerciseId].map((r, idx) => (
                    <View key={idx} className="flex-row items-center gap-2">
                      <Text className="w-12 text-sm font-medium text-slate-500">Set {idx + 1}</Text>
                      <SetInput
                        value={r.reps}
                        placeholder={ex.targetReps != null ? String(ex.targetReps) : "reps"}
                        onChangeText={(v) => updateRow(ex.exerciseId, idx, "reps", v)}
                        suffix="reps"
                      />
                      <SetInput
                        value={r.weight}
                        placeholder={ex.targetWeight != null ? String(ex.targetWeight) : "kg"}
                        onChangeText={(v) => updateRow(ex.exerciseId, idx, "weight", v)}
                        suffix="kg"
                        decimal
                      />
                    </View>
                  ))}
                </View>

                <View className="mt-3 flex-row flex-wrap gap-2">
                  <SmallBtn label="+ Add set" onPress={() => addRow(ex.exerciseId)} />
                  {ex.restSeconds && ex.restSeconds > 0 ? (
                    <SmallBtn dark label={`Rest ${ex.restSeconds}s`} onPress={() => setActiveRest(ex.restSeconds!)} />
                  ) : null}
                  {!swapped ? (
                    <>
                      <SmallBtn
                        label="Skip"
                        onPress={() => setModal({ exerciseId: ex.exerciseId, exerciseName: ex.name, mode: "skip" })}
                      />
                      <SmallBtn
                        label="Swap"
                        onPress={() => setModal({ exerciseId: ex.exerciseId, exerciseName: ex.name, mode: "swap" })}
                      />
                    </>
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {complete.error ? (
          <Text className="mb-3 text-sm text-red-600">{(complete.error as Error).message}</Text>
        ) : null}

        <Pressable
          className="mt-2 items-center rounded-xl bg-emerald-600 px-4 py-4 active:opacity-80"
          disabled={complete.isPending}
          onPress={() => complete.mutate()}
        >
          {complete.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-bold text-white">Complete workout</Text>
          )}
        </Pressable>
      </ScrollView>

      {activeRest != null ? (
        <View className="absolute inset-x-0 bottom-0 px-4 pb-6">
          <RestTimer seconds={activeRest} onDone={() => setActiveRest(null)} />
        </View>
      ) : null}

      <AdjustmentModal
        visible={modal != null}
        mode={modal?.mode ?? null}
        exerciseName={modal?.exerciseName ?? ""}
        library={(library.data ?? []).filter((e) => e.id !== modal?.exerciseId)}
        onClose={() => setModal(null)}
        onConfirm={confirmAdjust}
      />
    </SafeAreaView>
  );
}

function SmallBtn({
  label,
  onPress,
  dark,
}: {
  label: string;
  onPress: () => void;
  dark?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-lg px-3 py-2 ${
        dark ? "bg-slate-900 active:opacity-80" : "border border-slate-300 active:bg-slate-100"
      }`}
    >
      <Text className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-700"}`}>{label}</Text>
    </Pressable>
  );
}

function SetInput({
  value,
  placeholder,
  onChangeText,
  suffix,
  decimal,
}: {
  value: string;
  placeholder: string;
  onChangeText: (v: string) => void;
  suffix: string;
  decimal?: boolean;
}) {
  return (
    <View className="flex-1 flex-row items-center rounded-lg border border-slate-300 px-3">
      <TextInput
        className="flex-1 py-2 text-base text-slate-900"
        placeholder={placeholder}
        placeholderTextColor="#cbd5e1"
        keyboardType={decimal ? "decimal-pad" : "number-pad"}
        value={value}
        onChangeText={onChangeText}
      />
      <Text className="text-xs text-slate-400">{suffix}</Text>
    </View>
  );
}

// app/workout/[id].tsx — the workout screen (route /workout/:id, where :id is
// a scheduled_workout id).
//
// V17 (Step 7): who opens it decides the mode (lib/workoutSubject.ts). A
// client logs their own workout, as before. A trainer logs an OFFLINE
// client's workout in trainer mode — same screens, same rules, the client's
// name in the header, history and PRs from that client's own logs, and the
// save writes managed_client_id + logged_by. A trainer can view an app
// client's completed workout but never log it for them.
//
// D20a–e: an open workout runs in the dark workout mode (DESIGN.md §6): one
// exercise at a time with two big steppers and one tap per set
// (components/workout/SetView), a rest screen that starts by itself (RestView),
// the swap / skip sheet (components/AdjustmentModal), the all-exercises sheet
// (OverviewSheet) and the finish step with effort + note (FinishView). Logging
// a set only changes local state (lib/useWorkoutSession.ts); the one save at
// the end writes the workout_log, set_logs (with PR flags) and adjustments and
// marks the scheduled workout completed — saveWorkout(), unchanged rules.
// A completed workout opens the read-only summary.
//
// D20f/g: the screen stays awake, rest ends buzz or notify, and the open
// session is saved on the phone after every tap — minimizing (or a restart)
// loses nothing, and opening the workout again resumes it.

import { useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, toDateString, todayISO } from "@/lib/dates";
import { useWorkoutPrefs } from "@/lib/workoutPrefs";
import { trainerFirstName, useMyTrainer } from "@/lib/useMyTrainer";
import {
  clearSavedWorkout,
  loadSavedWorkout,
  loadWorkout,
  saveWorkout,
  subjectHistory,
  useWorkoutSession,
  type WorkoutData,
  type WorkoutMode as SessionMode,
  type WorkoutSubject,
} from "@/lib/useWorkoutSession";
import { workoutAccess, type WorkoutAccess } from "@/lib/workoutSubject";
import {
  exerciseName,
  isSwapped,
  sessionPrs,
  setsLogged,
  streakAfterCompleting,
  type WorkoutState,
} from "@/lib/workoutSession";
import { AdjustmentModal, type AdjustmentResult } from "@/components/AdjustmentModal";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import { longDate } from "@/components/home/format";
import { FinishView, type FinishInput } from "@/components/workout/FinishView";
import { OverviewSheet } from "@/components/workout/OverviewSheet";
import { RestView } from "@/components/workout/RestView";
import { SetView } from "@/components/workout/SetView";
import { AppText, colors, Icon, Sheet } from "@/components/ui";

// The name shown in trainer mode's header ("דנה · רגליים").
async function subjectName(subject: WorkoutSubject): Promise<string | null> {
  if (subject.kind === "managed") {
    const { data } = await supabase.from("managed_clients").select("name").eq("id", subject.id).maybeSingle();
    return data?.name ?? null;
  }
  const { data } = await supabase.from("profiles").select("display_name").eq("id", subject.id).maybeSingle();
  return data?.display_name ?? null;
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const { t } = useTranslation();
  const userId = session!.user.id;
  const role = profile?.role ?? null;

  const query = useQuery({
    queryKey: qk.workout.session(id),
    enabled: role != null,
    // Never served from cache: a resumed workout must start from the sets
    // saved on the phone a moment ago, not from an older copy.
    gcTime: 0,
    queryFn: async () => {
      // Whose workout is it, and may this user log it? Decided first.
      const { data: sw, error } = await supabase
        .from("scheduled_workouts")
        .select("trainer_id, client_id, managed_client_id, status")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const access: WorkoutAccess = sw
        ? workoutAccess(sw, { id: userId, role: role! })
        : { kind: "denied", reason: "notYours" };
      if (access.kind === "denied") return { access, data: null, restored: null, name: null };

      const data = await loadWorkout(id, access.subject, t("workout.exerciseFallback"));
      const name = access.mode === "trainer" ? await subjectName(access.subject) : null;
      if (data.status === "completed") {
        await clearSavedWorkout(userId, id);
        return { access, data, restored: null, name };
      }
      return { access, data, restored: await loadSavedWorkout(userId, id, data.exercises), name };
    },
  });

  if (role == null || query.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.iron }}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.bone} />
      </View>
    );
  }
  if (query.error || !query.data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.iron }}>
        <StatusBar style="light" />
        <AppText size={14} tone="ash" center>
          {query.error ? (query.error as Error).message : t("workout.notFound")}
        </AppText>
      </View>
    );
  }

  const { access, data, restored, name } = query.data;
  if (access.kind === "denied" || !data) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.iron }}>
        <StatusBar style="light" />
        <AppText size={14} tone="ash" center>
          {access.kind === "denied" && access.reason === "appClientLogsOwn"
            ? t("workout.trainerMode.appClientLogsOwn")
            : t("workout.notFound")}
        </AppText>
      </View>
    );
  }

  if (data.status === "completed") {
    return <CompletedSummary scheduledId={id} note={data.note} />;
  }

  return (
    <WorkoutMode
      data={data}
      restored={restored}
      subject={access.subject}
      mode={access.mode}
      subjectName={name}
      loggedBy={userId}
    />
  );
}

// ---------------------------------------------------------------------------
// Completed summary (read-only)
// ---------------------------------------------------------------------------
type LoggedSet = { set_index: number; reps: number | null; weight: number | null; is_pr: boolean };
type LoggedGroup = { exerciseId: string; name: string; sets: LoggedSet[] };
type Adj = { action: "skipped" | "swapped"; exerciseName: string; swapName: string | null; reason: string | null };

function CompletedSummary({ scheduledId, note }: { scheduledId: string; note: string | null }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: qk.workout.summary(scheduledId),
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
        name: nameMap.get(exId) ?? t("workout.exerciseFallback"),
        sets: byEx.get(exId)!,
      }));

      const adjustments: Adj[] = adjustmentsRaw.map((a) => ({
        action: a.action,
        exerciseName: nameMap.get(a.exercise_id) ?? t("workout.exerciseFallback"),
        swapName: a.swapped_for_exercise_id ? nameMap.get(a.swapped_for_exercise_id) ?? t("workout.exerciseFallback") : null,
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
          <View
            style={{ width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: colors.voltSoft }}
          >
            <Icon icon={Check} size={28} color={colors.voltInk} strokeWidth={2.4} />
          </View>
          <Text className="mt-2 text-xl font-bold text-slate-900">{t("workout.completedTitle")}</Text>
          {log ? (
            <Text className="mt-1 text-sm text-slate-500">
              {formatDisplayDate(toDateString(new Date(log.completed_at)))}
              {log.duration_seconds
                ? ` · ${t("workout.durationMinutes", { count: Math.max(1, Math.round(log.duration_seconds / 60)) })}`
                : ""}
            </Text>
          ) : null}
        </View>

        {log && (log.effort_rating != null || log.client_note) ? (
          <View className="mb-5 rounded-xl border border-slate-200 p-4">
            {log.effort_rating != null ? (
              <Text className="text-sm text-slate-700">
                {t("workout.effortLabel")} <Text className="font-bold text-slate-900">{t("workout.effortValue", { value: log.effort_rating })}</Text>
              </Text>
            ) : null}
            {log.client_note ? (
              <Text className="mt-1 text-sm text-slate-500 w-full text-left">“{log.client_note}”</Text>
            ) : null}
          </View>
        ) : null}

        {note ? (
          <View className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Text className="text-xs font-bold uppercase tracking-wide text-amber-700 w-full text-left">
              {t("workout.noteFromTrainer")}
            </Text>
            <Text className="mt-1 text-base text-amber-900 w-full text-left">{note}</Text>
          </View>
        ) : null}

        {groups.length === 0 && adjustments.length === 0 ? (
          <Text className="text-center text-sm text-slate-400">{t("workout.noSetsLogged")}</Text>
        ) : null}

        {groups.map((g) => (
          <View key={g.exerciseId} className="mb-3 rounded-2xl border border-slate-200 p-4">
            <Text className="text-base font-bold text-slate-900 w-full text-left">{g.name}</Text>
            <View className="mt-2 gap-1">
              {g.sets.map((s, i) => (
                <View key={i} className="flex-row items-center justify-between">
                  <Text className="text-sm text-slate-500">{t("workout.setNumber", { number: s.set_index + 1 })}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-base text-slate-900">
                      {t("workout.repsXWeight", {
                        reps: s.reps ?? "—",
                        weight: `${s.weight ?? "—"}${s.weight != null ? "kg" : ""}`,
                      })}
                    </Text>
                    {s.is_pr ? (
                      <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                        {t("workout.prBadge")}
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
            <Text className="text-sm font-semibold text-slate-700 w-full text-left">
              {a.action === "skipped"
                ? t("workout.skippedExercise", { name: a.exerciseName })
                : t("workout.swappedExercise", { from: a.exerciseName, to: a.swapName })}
            </Text>
            {a.reason ? <Text className="mt-0.5 text-sm text-slate-500 w-full text-left">“{a.reason}”</Text> : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Workout mode (an open workout)
// ---------------------------------------------------------------------------
function WorkoutMode({
  data,
  restored,
  subject,
  mode,
  subjectName,
  loggedBy,
}: {
  data: WorkoutData;
  restored: WorkoutState | null;
  subject: WorkoutSubject;
  mode: SessionMode;
  /** Trainer mode: the client's name, shown with the workout's title. */
  subjectName: string | null;
  loggedBy: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const prefs = useWorkoutPrefs();
  const myTrainer = useMyTrainer();
  // "Your trainer" lines only make sense to a client; in trainer mode the
  // components show neutral copy instead (trainerMode below).
  const trainerName = mode === "client" ? trainerFirstName(myTrainer.data) : null;
  const trainerMode = mode === "trainer";
  const workoutTitle = data.title ?? t("workout.freeWorkout");
  const title = trainerMode && subjectName ? `${subjectName} · ${workoutTitle}` : workoutTitle;
  const session = useWorkoutSession({
    scheduledId: data.scheduledId,
    title,
    exercises: data.exercises,
    subject,
    loggedBy,
    mode,
    restored,
    autoRest: prefs.autoRest,
    restAlerts: prefs.restAlerts,
    keepAwake: prefs.keepAwake,
  });
  const { state: s } = session;
  const [sheet, setSheet] = useState<"adjust" | "overview" | "demo" | null>(null);
  const [adjustMode, setAdjustMode] = useState<"swap" | "skip">("swap");

  const current = data.exercises[s.ex];
  const adj = s.adjustments[s.ex];

  // The swap list shares the exercise library's cache entry (same shape).
  const library = useQuery({
    queryKey: qk.exercises.list,
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("exercises").select("*").order("name");
      if (error) throw error;
      return rows;
    },
  });

  // The finish tile: this trainer's streak for the client, once this workout counts.
  const streak = useQuery({
    queryKey: qk.clientStreak.byTrainer(subject.id, data.trainerId),
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("client_streaks")
        .select("current_streak")
        .eq(subject.kind === "app" ? "client_id" : "managed_client_id", subject.id)
        .eq("trainer_id", data.trainerId)
        .maybeSingle();
      if (error) throw error;
      return row?.current_streak ?? 0;
    },
  });
  const finishStreak =
    streak.data != null ? streakAfterCompleting(streak.data, data.scheduledDate, todayISO()) : null;

  // Minimize (or back) just leaves: the session is saved on the phone and
  // opening this workout again resumes it.
  function minimize() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  const save = useMutation({
    mutationFn: (input: FinishInput) =>
      saveWorkout(session, {
        // A free workout (no exercises) had no timed session.
        durationSeconds: data.exercises.length > 0 ? input.durationSeconds : null,
        effort: input.effort,
        note: input.note,
      }),
  });

  function finish(input: FinishInput, then: "home" | "share") {
    save.mutate(input, {
      onSuccess: () => {
        const id = subject.id;
        // Stale but not refetched here: this screen is leaving, and a refetch
        // would flash the completed summary on the way out.
        queryClient.invalidateQueries({ queryKey: qk.workout.session(data.scheduledId), refetchType: "none" });
        queryClient.invalidateQueries({ queryKey: qk.workout.summary(data.scheduledId) });
        queryClient.invalidateQueries({ queryKey: qk.workout.open(loggedBy) });
        queryClient.invalidateQueries({ queryKey: qk.scheduledClient.all });
        queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
        queryClient.invalidateQueries({ queryKey: qk.clientStreak.all });
        if (mode === "client") {
          queryClient.invalidateQueries({ queryKey: qk.badges.own(id) });
          queryClient.invalidateQueries({ queryKey: qk.package.own(id) });
        }
        queryClient.invalidateQueries({ queryKey: qk.package.subject(subject.kind, id) });
        queryClient.invalidateQueries({ queryKey: qk.exercises.all });
        queryClient.invalidateQueries({ queryKey: qk.progress.all });
        queryClient.invalidateQueries({ queryKey: qk.shareCard.all });
        // Trainer-side views (in trainer mode, and on a shared dev device).
        queryClient.invalidateQueries({ queryKey: qk.clientDetail.subject(subject.kind, id) });
        queryClient.invalidateQueries({ queryKey: qk.clientContext.all });
        queryClient.invalidateQueries({ queryKey: qk.clientRisk.all });
        queryClient.invalidateQueries({ queryKey: qk.money.all });
        if (then === "share") router.replace(`/share-card/${id}`);
        else minimize();
      },
    });
  }

  function openAdjust(mode: "swap" | "skip") {
    setAdjustMode(mode);
    setSheet("adjust");
  }

  async function confirmAdjust(r: AdjustmentResult) {
    setSheet(null);
    if (r.action === "skip") {
      session.skip(r.reason);
      return;
    }
    if (!r.swapId || !r.swapName) return;
    // The substitute starts from the client's last set of it, else its
    // library default reps and the weight on screen.
    const sub = library.data?.find((e) => e.id === r.swapId);
    let weight = s.weight;
    let reps = sub?.default_reps ?? s.reps;
    try {
      const [last] = await subjectHistory([r.swapId], subject);
      if (last) {
        weight = last.weight;
        reps = last.reps ?? reps;
      }
    } catch {
      // No history: keep the numbers above.
    }
    session.swap({ reason: r.reason, exerciseId: r.swapId, name: r.swapName, weight, reps });
  }

  const swapLibrary = (library.data ?? []).filter(
    (e) => e.id !== current?.exerciseId && !(adj?.type === "swap" && adj.exerciseId === e.id),
  );
  const demoUrl =
    adj?.type === "swap"
      ? (library.data?.find((e) => e.id === adj.exerciseId)?.video_url ?? null)
      : (current?.videoUrl ?? null);
  const name = current ? exerciseName(s, s.ex) : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.iron }}>
      <StatusBar style="light" />

      {s.screen === "set" ? (
        <SetView
          session={session}
          title={title}
          trainerName={trainerName}
          onMinimize={minimize}
          onOverview={() => setSheet("overview")}
          onDemo={demoUrl ? () => setSheet("demo") : undefined}
          onSwap={() => openAdjust("swap")}
          onSkip={() => openAdjust("skip")}
        />
      ) : s.screen === "rest" ? (
        <RestView session={session} title={title} onMinimize={minimize} onOverview={() => setSheet("overview")} />
      ) : (
        <FinishView
          subtitle={`${title} · ${longDate(todayISO(), i18n.language)}`}
          startedAt={s.startedAt}
          trainerName={trainerName}
          showDuration={data.exercises.length > 0}
          sets={setsLogged(s)}
          streak={finishStreak}
          prs={sessionPrs(s)}
          saving={save.isPending}
          errorMessage={save.error ? (save.error as Error).message : null}
          trainerMode={trainerMode}
          onSave={(input) => finish(input, "home")}
          // The share card is the client's own (an offline client has no app).
          onShare={mode === "client" ? (input) => finish(input, "share") : undefined}
        />
      )}

      <AdjustmentModal
        visible={sheet === "adjust"}
        mode={adjustMode}
        exerciseName={name}
        exerciseLabel={t("workout.mode.exerciseOf", { n: s.ex + 1, total: data.exercises.length })}
        muscleGroup={isSwapped(s, s.ex) ? null : current?.muscleGroup}
        trainerName={trainerName}
        trainerMode={trainerMode}
        library={swapLibrary}
        onClose={() => setSheet(null)}
        onConfirm={confirmAdjust}
      />

      <OverviewSheet
        visible={sheet === "overview"}
        session={session}
        note={data.note}
        onClose={() => setSheet(null)}
        onJump={(ex) => {
          setSheet(null);
          session.jump(ex);
        }}
        onFinish={() => {
          setSheet(null);
          session.finishNow();
        }}
      />

      <Sheet visible={sheet === "demo"} onClose={() => setSheet(null)} closeLabel={t("workout.mode.closeDemo")} title={name} dark>
        {sheet === "demo" ? <ExerciseVideo url={demoUrl} /> : null}
      </Sheet>
    </View>
  );
}

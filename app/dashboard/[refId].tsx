// app/dashboard/[refId].tsx — trainer's client-detail drill-down (V8).
//
// :refId is either an app client's profile id or a managed_client id; ?kind=
// disambiguates which (see lib/useRoster.ts / the roster row link on the Home
// tab). Did-today / streak / overdue reuse the same 0008 SQL views as the
// roster. App clients (who log through the app) also get recent logs, effort
// scores, PRs, and their weight chart. Offline/managed clients have no
// account — they never create workout_logs or progress_entries — so they just
// get their completed-workout history and the "mark complete" action.

import { useState } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { directionalTextClassName, LTR_INPUT_STYLE } from "@/lib/i18n";
import { DEFAULT_TIME_ZONE, formatDisplayDate, toDateString } from "@/lib/dates";
import { LineChart } from "@/components/LineChart";
import type { Database } from "@/lib/database.types";

type WorkoutStatus = Database["public"]["Views"]["client_workout_status"]["Row"];
type ClientNote = Database["public"]["Tables"]["client_notes"]["Row"];

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: DEFAULT_TIME_ZONE }).format(
    new Date(`${iso}T12:00:00Z`),
  );
const dayOf = (timestamptz: string) => formatDisplayDate(toDateString(new Date(timestamptz)));
const noteTimestamp = (iso: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DEFAULT_TIME_ZONE,
  }).format(new Date(iso));

type Detail =
  | {
      kind: "app";
      name: string;
      streak: number;
      status: WorkoutStatus | null;
      // V12b: intake questionnaire answers; null until the client fills it in.
      intake: Record<string, string> | null;
      logs: {
        id: string;
        scheduledWorkoutId: string;
        completed_at: string;
        effort_rating: number | null;
        client_note: string | null;
        template_name: string;
        paid: boolean;
      }[];
      prs: { exercise_name: string; weight: number | null; reps: number | null; date: string }[];
      chartData: { label: string; value: number }[];
    }
  | {
      kind: "managed";
      name: string;
      streak: number;
      status: WorkoutStatus | null;
      recentScheduled: {
        id: string;
        scheduled_date: string;
        status: "scheduled" | "completed";
        template_name: string;
        paid: boolean;
      }[];
    };

export default function ClientDetailScreen() {
  const { t } = useTranslation();
  const { refId, kind: kindParam } = useLocalSearchParams<{ refId: string; kind?: string }>();
  const kind: "app" | "managed" = kindParam === "managed" ? "managed" : "app";
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();

  if (profile && profile.role !== "trainer") return <Redirect href="/" />;
  const trainerId = session!.user.id;

  const detail = useQuery({
    queryKey: ["client-detail", kind, refId],
    queryFn: async (): Promise<Detail> => {
      const streakCol = kind === "app" ? "client_id" : "managed_client_id";

      const [nameRes, streakRes, statusRes] = await Promise.all([
        kind === "app"
          ? supabase.from("profiles").select("display_name, intake").eq("id", refId).single()
          : supabase.from("managed_clients").select("name").eq("id", refId).single(),
        supabase.from("client_streaks").select("*").eq("trainer_id", trainerId).eq(streakCol, refId).maybeSingle(),
        supabase
          .from("client_workout_status")
          .select("*")
          .eq("trainer_id", trainerId)
          .eq(streakCol, refId)
          .maybeSingle(),
      ]);
      if (nameRes.error) throw nameRes.error;
      if (streakRes.error) throw streakRes.error;
      if (statusRes.error) throw statusRes.error;

      const name =
        ("display_name" in nameRes.data! ? nameRes.data.display_name : nameRes.data!.name) ?? t("dashboard.client");
      const streak = streakRes.data?.current_streak ?? 0;
      const status = statusRes.data ?? null;

      if (kind === "managed") {
        const { data: recent, error } = await supabase
          .from("scheduled_workouts")
          .select("id, scheduled_date, status, template_id, paid")
          .eq("trainer_id", trainerId)
          .eq("managed_client_id", refId)
          .order("scheduled_date", { ascending: false })
          .limit(10);
        if (error) throw error;

        const tplIds = [...new Set(recent.map((r) => r.template_id).filter(Boolean) as string[])];
        const tNames = new Map<string, string>();
        if (tplIds.length > 0) {
          const { data } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
          data?.forEach((t) => tNames.set(t.id, t.name));
        }

        return {
          kind: "managed",
          name,
          streak,
          status,
          recentScheduled: recent.map((r) => ({
            id: r.id,
            scheduled_date: r.scheduled_date,
            status: r.status,
            template_name: r.template_id ? tNames.get(r.template_id) ?? t("dashboard.workout") : t("dashboard.workout"),
            paid: r.paid,
          })),
        };
      }

      const [logsRes, progressRes, prLogsRes] = await Promise.all([
        supabase
          .from("workout_logs")
          .select("*")
          .eq("client_id", refId)
          .order("completed_at", { ascending: false })
          .limit(10),
        supabase.from("progress_entries").select("*").eq("client_id", refId).order("date", { ascending: true }),
        // A wider (but lightweight) window of log ids so a PR from further back
        // than the 10 shown below still surfaces.
        supabase
          .from("workout_logs")
          .select("id, completed_at")
          .eq("client_id", refId)
          .order("completed_at", { ascending: false })
          .limit(200),
      ]);
      if (logsRes.error) throw logsRes.error;
      if (progressRes.error) throw progressRes.error;
      if (prLogsRes.error) throw prLogsRes.error;

      const logs = logsRes.data;
      const scheduledIds = [...new Set(logs.map((l) => l.scheduled_workout_id))];
      const tNameByScheduled = new Map<string, string>();
      const paidByScheduled = new Map<string, boolean>();
      if (scheduledIds.length > 0) {
        const { data: sws } = await supabase
          .from("scheduled_workouts")
          .select("id, template_id, paid")
          .in("id", scheduledIds);
        const tplIds = [...new Set((sws ?? []).map((s) => s.template_id).filter(Boolean) as string[])];
        const tNames = new Map<string, string>();
        if (tplIds.length > 0) {
          const { data: tpls } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
          tpls?.forEach((t) => tNames.set(t.id, t.name));
        }
        sws?.forEach((s) => {
          tNameByScheduled.set(
            s.id,
            s.template_id ? tNames.get(s.template_id) ?? t("dashboard.workout") : t("dashboard.workout"),
          );
          paidByScheduled.set(s.id, s.paid);
        });
      }

      const prLogIds = prLogsRes.data.map((l) => l.id);
      const prLogDates = new Map(prLogsRes.data.map((l) => [l.id, l.completed_at]));
      let prs: Extract<Detail, { kind: "app" }>["prs"] = [];
      if (prLogIds.length > 0) {
        const { data: prSets, error: prErr } = await supabase
          .from("set_logs")
          .select("*")
          .in("workout_log_id", prLogIds)
          .eq("is_pr", true)
          .order("created_at", { ascending: false })
          .limit(10);
        if (prErr) throw prErr;

        const exIds = [...new Set(prSets.map((s) => s.exercise_id))];
        const exNames = new Map<string, string>();
        if (exIds.length > 0) {
          const { data: exs } = await supabase.from("exercises").select("id, name").in("id", exIds);
          exs?.forEach((e) => exNames.set(e.id, e.name));
        }
        prs = prSets.map((s) => ({
          exercise_name: exNames.get(s.exercise_id) ?? t("dashboard.exercise"),
          weight: s.weight,
          reps: s.reps,
          date: prLogDates.get(s.workout_log_id) ?? "",
        }));
      }

      return {
        kind: "app",
        name,
        streak,
        status,
        intake:
          "intake" in nameRes.data! ? ((nameRes.data.intake as Record<string, string> | null) ?? null) : null,
        logs: logs.map((l) => ({
          id: l.id,
          scheduledWorkoutId: l.scheduled_workout_id,
          completed_at: l.completed_at,
          effort_rating: l.effort_rating,
          client_note: l.client_note,
          template_name: tNameByScheduled.get(l.scheduled_workout_id) ?? t("dashboard.workout"),
          paid: paidByScheduled.get(l.scheduled_workout_id) ?? false,
        })),
        prs,
        chartData: progressRes.data
          .filter((p) => p.weight != null)
          .map((p) => ({ label: shortDate(p.date), value: Number(p.weight) })),
      };
    },
  });

  const markComplete = useMutation({
    mutationFn: async (scheduledWorkoutId: string) => {
      const { error } = await supabase
        .from("scheduled_workouts")
        .update({ status: "completed" })
        .eq("id", scheduledWorkoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-detail", kind, refId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-status"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-trainer"] });
      queryClient.invalidateQueries({ queryKey: ["package", kind, refId] });
    },
  });

  // Payment reminder (V10 add-on) — a manual "did I collect payment for this
  // session" flag per workout. Trainer-only by RLS trigger (a client can't
  // flip their own); not a payment system, just bookkeeping.
  const togglePaid = useMutation({
    mutationFn: async ({ scheduledWorkoutId, paid }: { scheduledWorkoutId: string; paid: boolean }) => {
      const { error } = await supabase.from("scheduled_workouts").update({ paid }).eq("id", scheduledWorkoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-detail", kind, refId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-status"] });
    },
  });

  // Session package (V10) — both client kinds. used_sessions auto-increments
  // via a DB trigger on completion (0010_checkins_packages.sql); the trainer
  // only ever edits total_sessions here.
  const streakCol = kind === "app" ? "client_id" : "managed_client_id";
  const [totalSessionsInput, setTotalSessionsInput] = useState("");
  // V13: what this client is charged per session; only editable, never blank-submitted
  // (an empty field leaves price_per_session untouched — see savePrice below).
  const [priceInput, setPriceInput] = useState("");

  const packageQuery = useQuery({
    queryKey: ["package", kind, refId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq(streakCol, refId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const savePackage = useMutation({
    mutationFn: async (totalSessions: number) => {
      if (packageQuery.data) {
        const { error } = await supabase
          .from("packages")
          .update({ total_sessions: totalSessions })
          .eq("id", packageQuery.data.id);
        if (error) throw error;
      } else if (kind === "app") {
        const { error } = await supabase
          .from("packages")
          .insert({ trainer_id: trainerId, client_id: refId, total_sessions: totalSessions });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("packages")
          .insert({ trainer_id: trainerId, managed_client_id: refId, total_sessions: totalSessions });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["package", kind, refId] }),
  });

  const savePrice = useMutation({
    mutationFn: async (price: number) => {
      if (packageQuery.data) {
        const { error } = await supabase
          .from("packages")
          .update({ price_per_session: price })
          .eq("id", packageQuery.data.id);
        if (error) throw error;
      } else if (kind === "app") {
        const { error } = await supabase
          .from("packages")
          .insert({ trainer_id: trainerId, client_id: refId, price_per_session: price });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("packages")
          .insert({ trainer_id: trainerId, managed_client_id: refId, price_per_session: price });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["package", kind, refId] });
      queryClient.invalidateQueries({ queryKey: ["trainer-monthly-money"] });
      setPriceInput("");
    },
  });

  // Latest weekly check-in (V10) — app clients only (self-reported).
  const latestCheckin = useQuery({
    queryKey: ["latest-checkin", refId],
    enabled: kind === "app",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("*")
        .eq("client_id", refId)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Private trainer-only notes (V8b) — app clients only (client_notes.client_id
  // -> profiles). No client-read RLS policy exists at all, so these never
  // surface anywhere in the client's app.
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const notes = useQuery({
    queryKey: ["client-notes", refId],
    enabled: kind === "app",
    queryFn: async (): Promise<ClientNote[]> => {
      const { data, error } = await supabase
        .from("client_notes")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq("client_id", refId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("client_notes").insert({ trainer_id: trainerId, client_id: refId, body });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", refId] });
      setNewNote("");
    },
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase.from("client_notes").update({ body }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-notes", refId] });
      setEditingNoteId(null);
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-notes", refId] }),
  });

  function confirmDeleteNote(id: string) {
    Alert.alert(t("dashboard.notes.deleteTitle"), t("dashboard.notes.deleteMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("dashboard.notes.delete"), style: "destructive", onPress: () => deleteNote.mutate(id) },
    ]);
  }

  if (detail.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }
  if (detail.error || !detail.data) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-sm text-red-600">
          {detail.error ? (detail.error as Error).message : t("dashboard.clientNotFound")}
        </Text>
      </View>
    );
  }

  const d = detail.data;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6">
        <Text className="w-full text-left text-2xl font-bold text-slate-900">{d.name}</Text>

        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <Text className="text-sm text-slate-500">{t("dashboard.dayStreak", { count: d.streak })}</Text>
          {d.kind === "managed" ? (
            <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {t("dashboard.offline")}
            </Text>
          ) : null}
          {d.status?.completed_today ? (
            <Text className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              {t("dashboard.doneToday")}
            </Text>
          ) : d.status?.is_overdue ? (
            <Text className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {t("dashboard.overdue", { count: d.status.overdue_count })}
            </Text>
          ) : d.status?.has_workout_today ? (
            <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {t("dashboard.dueToday")}
            </Text>
          ) : (
            <Text className="text-xs text-slate-400">{t("dashboard.noWorkoutToday")}</Text>
          )}
        </View>

        {d.status?.next_scheduled_date ? (
          <Text className="mt-1 w-full text-left text-xs text-slate-400">
            {t("dashboard.next", { date: formatDisplayDate(d.status.next_scheduled_date) })}
            {d.status.next_scheduled_time ? ` · ${d.status.next_scheduled_time.slice(0, 5)}` : ""}
          </Text>
        ) : null}

        {d.kind === "managed" && d.status?.actionable_id ? (
          <Pressable
            className="mt-4 items-center self-start rounded-xl border border-slate-300 px-4 py-2.5 active:bg-slate-100"
            disabled={markComplete.isPending}
            onPress={() => markComplete.mutate(d.status!.actionable_id!)}
          >
            <Text className="text-sm font-semibold text-slate-700">{t("dashboard.markComplete")}</Text>
          </Pressable>
        ) : null}

        {markComplete.error ? (
          <Text className="mt-2 w-full text-left text-sm text-red-600">
            {(markComplete.error as Error).message}
          </Text>
        ) : null}

        <View className="mt-7 rounded-2xl border border-slate-200 p-4">
          <Text className="w-full text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("dashboard.sessionPackage.title")}
          </Text>
          {packageQuery.data ? (
            <Text className="mt-1 text-base text-slate-900">
              {t("dashboard.sessionPackage.remaining", {
                remaining: packageQuery.data.total_sessions - packageQuery.data.used_sessions,
                total: packageQuery.data.total_sessions,
              })}
              <Text className="text-sm text-slate-400">
                {" "}
                {t("dashboard.sessionPackage.used", { count: packageQuery.data.used_sessions })}
              </Text>
            </Text>
          ) : (
            <Text className="mt-1 w-full text-left text-sm text-slate-400">
              {t("dashboard.sessionPackage.notSetUp")}
            </Text>
          )}
          <View className="mt-3 flex-row items-center gap-2">
            <TextInput
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
              style={LTR_INPUT_STYLE}
              placeholder={t("dashboard.sessionPackage.totalPlaceholder")}
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              value={totalSessionsInput}
              onChangeText={setTotalSessionsInput}
            />
            <Pressable
              className="items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 active:opacity-80"
              disabled={savePackage.isPending || totalSessionsInput.trim() === ""}
              onPress={() => savePackage.mutate(Number.parseInt(totalSessionsInput, 10))}
            >
              {savePackage.isPending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text className="text-sm font-semibold text-white">
                  {packageQuery.data
                    ? t("dashboard.sessionPackage.updateTotal")
                    : t("dashboard.sessionPackage.setTotal")}
                </Text>
              )}
            </Pressable>
          </View>
          {savePackage.error ? (
            <Text className="mt-2 w-full text-left text-xs text-red-600">
              {(savePackage.error as Error).message}
            </Text>
          ) : null}

          <View className="mt-4 border-t border-slate-100 pt-4">
            <Text className="w-full text-left text-xs text-slate-500">
              {packageQuery.data?.price_per_session != null
                ? t("dashboard.sessionPackage.pricePerSession", { price: packageQuery.data.price_per_session })
                : t("dashboard.sessionPackage.priceNotSet")}
            </Text>
            <View className="mt-2 flex-row items-center gap-2">
              <TextInput
                className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
                style={LTR_INPUT_STYLE}
                placeholder={t("dashboard.sessionPackage.pricePlaceholder")}
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                value={priceInput}
                onChangeText={setPriceInput}
              />
              <Pressable
                className="items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 active:opacity-80"
                disabled={savePrice.isPending || priceInput.trim() === ""}
                onPress={() => savePrice.mutate(Number.parseFloat(priceInput))}
              >
                {savePrice.isPending ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text className="text-sm font-semibold text-white">
                    {t("dashboard.sessionPackage.setPrice")}
                  </Text>
                )}
              </Pressable>
            </View>
            {savePrice.error ? (
              <Text className="mt-2 w-full text-left text-xs text-red-600">
                {(savePrice.error as Error).message}
              </Text>
            ) : null}
          </View>
        </View>

        {d.kind === "app" ? (
          <>
            <View className="mt-7 rounded-2xl border border-slate-200 p-4">
              <Text className="w-full text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("dashboard.checkin.title")}
              </Text>
              {latestCheckin.data ? (
                <>
                  <Text className="mt-1 text-sm text-slate-500">
                    {t("dashboard.checkin.weekOf", { date: formatDisplayDate(latestCheckin.data.week_start) })}
                  </Text>
                  <Text className="mt-1 text-sm text-slate-700">
                    {t("dashboard.checkin.summary", {
                      sleep: latestCheckin.data.sleep,
                      energy: latestCheckin.data.energy,
                      soreness: latestCheckin.data.soreness,
                      adherence: latestCheckin.data.adherence,
                    })}
                  </Text>
                  {latestCheckin.data.note ? (
                    <Text className="mt-1 w-full text-left text-sm text-slate-400">
                      “{latestCheckin.data.note}”
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text className="mt-1 w-full text-left text-sm text-slate-400">
                  {t("dashboard.checkin.noneYet")}
                </Text>
              )}
            </View>

            {/* V12b: intake questionnaire answers (filled in once by the client). */}
            <View className="mt-7 rounded-2xl border border-slate-200 p-4">
              <Text className="w-full text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("dashboard.intake.title")}
              </Text>
              {d.kind === "app" && d.intake != null ? (
                (["goals", "injuries", "equipment", "experience"] as const).some(
                  // typeof guard: intake is client-writable jsonb — never render non-strings.
                  (k) => typeof d.intake![k] === "string" && d.intake![k],
                ) ? (
                  (["goals", "injuries", "equipment", "experience"] as const).map((k) =>
                    typeof d.intake![k] === "string" && d.intake![k] ? (
                      <View key={k} className="mt-2">
                        <Text className="w-full text-left text-xs uppercase tracking-wide text-slate-400">
                          {t(`intake.${k}`)}
                        </Text>
                        <Text className="mt-0.5 w-full text-left text-sm text-slate-700">
                          {k === "experience" ? t(`intake.${d.intake![k]}`) : d.intake![k]}
                        </Text>
                      </View>
                    ) : null,
                  )
                ) : (
                  <Text className="mt-1 w-full text-left text-sm text-slate-400">
                    {t("dashboard.intake.nothingShared")}
                  </Text>
                )
              ) : (
                <Text className="mt-1 w-full text-left text-sm text-slate-400">
                  {t("dashboard.intake.noneYet")}
                </Text>
              )}
            </View>

            <View className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Text className="w-full text-left text-xs font-bold uppercase tracking-wide text-amber-700">
                {t("dashboard.notes.title")}
              </Text>
              <Text className="mt-1 w-full text-left text-xs text-amber-700">
                {t("dashboard.notes.subtitle")}
              </Text>

              <View className="mt-3 flex-row items-end gap-2">
                <TextInput
                  className={`flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900 ${directionalTextClassName()}`}
                  placeholder={t("dashboard.notes.placeholder")}
                  placeholderTextColor="#b45309"
                  value={newNote}
                  onChangeText={setNewNote}
                  multiline
                />
                <Pressable
                  className="items-center justify-center rounded-lg bg-slate-900 px-3 py-2.5 active:opacity-80"
                  disabled={addNote.isPending || newNote.trim().length === 0}
                  onPress={() => addNote.mutate(newNote.trim())}
                >
                  {addNote.isPending ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text className="text-sm font-semibold text-white">{t("dashboard.notes.add")}</Text>
                  )}
                </Pressable>
              </View>
              {addNote.error ? (
                <Text className="mt-2 w-full text-left text-xs text-red-600">
                  {(addNote.error as Error).message}
                </Text>
              ) : null}

              <View className="mt-3 gap-2">
                {notes.isLoading ? (
                  <ActivityIndicator />
                ) : notes.data && notes.data.length > 0 ? (
                  notes.data.map((n) => (
                    <View key={n.id} className="rounded-lg border border-amber-200 bg-white p-3">
                      {editingNoteId === n.id ? (
                        <>
                          <TextInput
                            className={`rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 ${directionalTextClassName()}`}
                            value={editingBody}
                            onChangeText={setEditingBody}
                            multiline
                            autoFocus
                          />
                          <View className="mt-2 flex-row gap-2">
                            <Pressable
                              className="rounded-lg bg-slate-900 px-3 py-1.5 active:opacity-80"
                              disabled={updateNote.isPending || editingBody.trim().length === 0}
                              onPress={() => updateNote.mutate({ id: n.id, body: editingBody.trim() })}
                            >
                              <Text className="text-xs font-semibold text-white">{t("common.save")}</Text>
                            </Pressable>
                            <Pressable
                              className="rounded-lg border border-slate-300 px-3 py-1.5 active:bg-slate-100"
                              onPress={() => setEditingNoteId(null)}
                            >
                              <Text className="text-xs font-semibold text-slate-700">{t("common.cancel")}</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <>
                          <Text className="w-full text-left text-sm text-slate-800">{n.body}</Text>
                          <View className="mt-2 flex-row items-center justify-between">
                            <Text className="text-xs text-slate-400">{noteTimestamp(n.created_at)}</Text>
                            <View className="flex-row gap-3">
                              <Pressable
                                onPress={() => {
                                  setEditingNoteId(n.id);
                                  setEditingBody(n.body);
                                }}
                              >
                                <Text className="text-xs font-semibold text-slate-500">{t("dashboard.notes.edit")}</Text>
                              </Pressable>
                              <Pressable onPress={() => confirmDeleteNote(n.id)}>
                                <Text className="text-xs font-semibold text-red-600">{t("dashboard.notes.delete")}</Text>
                              </Pressable>
                            </View>
                          </View>
                        </>
                      )}
                    </View>
                  ))
                ) : (
                  <Text className="w-full text-left text-xs text-amber-700">
                    {t("dashboard.notes.noneYet")}
                  </Text>
                )}
              </View>
            </View>

            <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("dashboard.weightOverTime")}
            </Text>
            <View className="rounded-2xl border border-slate-200 p-3">
              <LineChart data={d.chartData} />
            </View>

            <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("dashboard.recentLogs")}
            </Text>
            {d.logs.length > 0 ? (
              <View className="gap-2">
                {d.logs.map((l) => (
                  <View key={l.id} className="rounded-xl border border-slate-200 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-slate-900">{l.template_name}</Text>
                      <Text className="text-xs text-slate-400">{dayOf(l.completed_at)}</Text>
                    </View>
                    {l.effort_rating != null ? (
                      <Text className="mt-1 text-sm text-slate-600">
                        {t("dashboard.effort", { rating: l.effort_rating })}
                      </Text>
                    ) : null}
                    {l.client_note ? (
                      <Text className="mt-1 w-full text-left text-sm text-slate-400">
                        “{l.client_note}”
                      </Text>
                    ) : null}
                    <PaidToggle
                      paid={l.paid}
                      pending={togglePaid.isPending}
                      onToggle={() => togglePaid.mutate({ scheduledWorkoutId: l.scheduledWorkoutId, paid: !l.paid })}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text className="w-full text-left text-sm text-slate-400">
                {t("dashboard.noCompletedWorkouts")}
              </Text>
            )}

            <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("dashboard.prsTitle")}
            </Text>
            {d.prs.length > 0 ? (
              <View className="gap-2">
                {d.prs.map((p, i) => (
                  <View
                    key={i}
                    className="flex-row items-center justify-between rounded-xl border border-slate-200 p-3"
                  >
                    <View>
                      <Text className="text-sm font-semibold text-slate-900">{p.exercise_name}</Text>
                      {p.date ? <Text className="text-xs text-slate-400">{dayOf(p.date)}</Text> : null}
                    </View>
                    <Text className="text-sm text-slate-500">
                      {[
                        p.weight != null ? t("dashboard.weightKg", { weight: p.weight }) : null,
                        p.reps != null ? t("dashboard.reps", { count: p.reps }) : null,
                      ]
                        .filter(Boolean)
                        .join(" × ")}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="w-full text-left text-sm text-slate-400">
                {t("dashboard.noPrsYet")}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text className="mb-2 mt-7 w-full text-left text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t("dashboard.recentWorkouts")}
            </Text>
            {d.recentScheduled.length > 0 ? (
              <View className="gap-2">
                {d.recentScheduled.map((r) => (
                  <View key={r.id} className="rounded-xl border border-slate-200 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-semibold text-slate-900">{r.template_name}</Text>
                      <Text className="text-xs text-slate-500">
                        {formatDisplayDate(r.scheduled_date)} ·{" "}
                        {r.status === "completed" ? t("dashboard.doneCheck") : t("dashboard.notDone")}
                      </Text>
                    </View>
                    {r.status === "completed" ? (
                      <PaidToggle
                        paid={r.paid}
                        pending={togglePaid.isPending}
                        onToggle={() => togglePaid.mutate({ scheduledWorkoutId: r.id, paid: !r.paid })}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text className="w-full text-left text-sm text-slate-400">
                {t("dashboard.nothingScheduledYet")}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function PaidToggle({ paid, pending, onToggle }: { paid: boolean; pending: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable
      className={`mt-2 self-start rounded-full px-2 py-0.5 ${paid ? "bg-emerald-100" : "bg-slate-100"}`}
      disabled={pending}
      onPress={onToggle}
    >
      <Text className={`text-xs font-semibold ${paid ? "text-emerald-700" : "text-slate-500"}`}>
        {paid ? t("dashboard.paid") : t("dashboard.markPaid")}
      </Text>
    </Pressable>
  );
}

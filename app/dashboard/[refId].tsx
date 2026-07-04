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

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
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
      logs: {
        id: string;
        completed_at: string;
        effort_rating: number | null;
        client_note: string | null;
        template_name: string;
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
      }[];
    };

export default function ClientDetailScreen() {
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
          ? supabase.from("profiles").select("display_name").eq("id", refId).single()
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

      const name = ("display_name" in nameRes.data! ? nameRes.data.display_name : nameRes.data!.name) ?? "Client";
      const streak = streakRes.data?.current_streak ?? 0;
      const status = statusRes.data ?? null;

      if (kind === "managed") {
        const { data: recent, error } = await supabase
          .from("scheduled_workouts")
          .select("id, scheduled_date, status, template_id")
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
            template_name: r.template_id ? tNames.get(r.template_id) ?? "Workout" : "Workout",
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
      if (scheduledIds.length > 0) {
        const { data: sws } = await supabase
          .from("scheduled_workouts")
          .select("id, template_id")
          .in("id", scheduledIds);
        const tplIds = [...new Set((sws ?? []).map((s) => s.template_id).filter(Boolean) as string[])];
        const tNames = new Map<string, string>();
        if (tplIds.length > 0) {
          const { data: tpls } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
          tpls?.forEach((t) => tNames.set(t.id, t.name));
        }
        sws?.forEach((s) => {
          tNameByScheduled.set(s.id, s.template_id ? tNames.get(s.template_id) ?? "Workout" : "Workout");
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
          exercise_name: exNames.get(s.exercise_id) ?? "Exercise",
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
        logs: logs.map((l) => ({
          id: l.id,
          completed_at: l.completed_at,
          effort_rating: l.effort_rating,
          client_note: l.client_note,
          template_name: tNameByScheduled.get(l.scheduled_workout_id) ?? "Workout",
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
    Alert.alert("Delete note", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteNote.mutate(id) },
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
          {detail.error ? (detail.error as Error).message : "Client not found."}
        </Text>
      </View>
    );
  }

  const d = detail.data;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6">
        <Text className="text-2xl font-bold text-slate-900">{d.name}</Text>

        <View className="mt-2 flex-row flex-wrap items-center gap-2">
          <Text className="text-sm text-slate-500">🔥 {d.streak} day streak</Text>
          {d.kind === "managed" ? (
            <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">offline</Text>
          ) : null}
          {d.status?.completed_today ? (
            <Text className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              ✓ Done today
            </Text>
          ) : d.status?.is_overdue ? (
            <Text className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              ⚠ Overdue ({d.status.overdue_count})
            </Text>
          ) : d.status?.has_workout_today ? (
            <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Due today
            </Text>
          ) : (
            <Text className="text-xs text-slate-400">No workout today</Text>
          )}
        </View>

        {d.status?.next_scheduled_date ? (
          <Text className="mt-1 text-xs text-slate-400">
            Next: {formatDisplayDate(d.status.next_scheduled_date)}
            {d.status.next_scheduled_time ? ` · ${d.status.next_scheduled_time.slice(0, 5)}` : ""}
          </Text>
        ) : null}

        {d.kind === "managed" && d.status?.actionable_id ? (
          <Pressable
            className="mt-4 items-center self-start rounded-xl border border-slate-300 px-4 py-2.5 active:bg-slate-100"
            disabled={markComplete.isPending}
            onPress={() => markComplete.mutate(d.status!.actionable_id!)}
          >
            <Text className="text-sm font-semibold text-slate-700">Mark complete</Text>
          </Pressable>
        ) : null}

        {markComplete.error ? (
          <Text className="mt-2 text-sm text-red-600">{(markComplete.error as Error).message}</Text>
        ) : null}

        {d.kind === "app" ? (
          <>
            <View className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Text className="text-xs font-bold uppercase tracking-wide text-amber-700">
                🔒 Private notes — trainer only
              </Text>
              <Text className="mt-1 text-xs text-amber-700">The client can never see these.</Text>

              <View className="mt-3 flex-row items-end gap-2">
                <TextInput
                  className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
                  placeholder="e.g. needs core work, tends to skip legs"
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
                    <Text className="text-sm font-semibold text-white">Add</Text>
                  )}
                </Pressable>
              </View>
              {addNote.error ? (
                <Text className="mt-2 text-xs text-red-600">{(addNote.error as Error).message}</Text>
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
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
                              <Text className="text-xs font-semibold text-white">Save</Text>
                            </Pressable>
                            <Pressable
                              className="rounded-lg border border-slate-300 px-3 py-1.5 active:bg-slate-100"
                              onPress={() => setEditingNoteId(null)}
                            >
                              <Text className="text-xs font-semibold text-slate-700">Cancel</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <>
                          <Text className="text-sm text-slate-800">{n.body}</Text>
                          <View className="mt-2 flex-row items-center justify-between">
                            <Text className="text-xs text-slate-400">{noteTimestamp(n.created_at)}</Text>
                            <View className="flex-row gap-3">
                              <Pressable
                                onPress={() => {
                                  setEditingNoteId(n.id);
                                  setEditingBody(n.body);
                                }}
                              >
                                <Text className="text-xs font-semibold text-slate-500">Edit</Text>
                              </Pressable>
                              <Pressable onPress={() => confirmDeleteNote(n.id)}>
                                <Text className="text-xs font-semibold text-red-600">Delete</Text>
                              </Pressable>
                            </View>
                          </View>
                        </>
                      )}
                    </View>
                  ))
                ) : (
                  <Text className="text-xs text-amber-700">No notes yet.</Text>
                )}
              </View>
            </View>

            <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Weight over time
            </Text>
            <View className="rounded-2xl border border-slate-200 p-3">
              <LineChart data={d.chartData} />
            </View>

            <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recent logs
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
                      <Text className="mt-1 text-sm text-slate-600">Effort: {l.effort_rating}/10</Text>
                    ) : null}
                    {l.client_note ? <Text className="mt-1 text-sm text-slate-400">“{l.client_note}”</Text> : null}
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-slate-400">No completed workouts yet.</Text>
            )}

            <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">PRs</Text>
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
                      {[p.weight != null ? `${p.weight}kg` : null, p.reps != null ? `${p.reps} reps` : null]
                        .filter(Boolean)
                        .join(" × ")}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-slate-400">No PRs yet.</Text>
            )}
          </>
        ) : (
          <>
            <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recent workouts
            </Text>
            {d.recentScheduled.length > 0 ? (
              <View className="gap-2">
                {d.recentScheduled.map((r) => (
                  <View
                    key={r.id}
                    className="flex-row items-center justify-between rounded-xl border border-slate-200 p-3"
                  >
                    <Text className="text-sm font-semibold text-slate-900">{r.template_name}</Text>
                    <Text className="text-xs text-slate-500">
                      {formatDisplayDate(r.scheduled_date)} · {r.status === "completed" ? "✓ Done" : "Not done"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="text-sm text-slate-400">Nothing scheduled yet.</Text>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

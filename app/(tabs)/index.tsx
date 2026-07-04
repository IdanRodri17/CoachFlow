// app/(tabs)/index.tsx — the Home tab (route: /).
//
// Client: a greeting + their UPCOMING scheduled workouts (date + template name).
// Trainer: the dashboard (V8) — roster with did-today / streak / due-overdue,
// each row drilling into app/dashboard/[refId].tsx. All derived numbers (missed,
// streak) come from the SQL views in 0008_dashboard_views.sql, never computed here.

import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
import { addDays, formatDisplayDate, isToday, todayISO } from "@/lib/dates";

// Every roster member is keyed by client_id for app clients, or "m:<id>" for
// offline/managed clients — matches the subject_key the dashboard views use.
function rosterKey(kind: "app" | "managed", refId: string) {
  return kind === "app" ? refId : `m:${refId}`;
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const isTrainer = profile?.role === "trainer";
  const trainerId = session?.user.id ?? "";

  const roster = useRosterClients(trainerId, { enabled: isTrainer && !!session });

  const dashboard = useQuery({
    queryKey: ["dashboard-status"],
    enabled: isTrainer && !!session,
    queryFn: async () => {
      const [streaksRes, statusRes] = await Promise.all([
        supabase.from("client_streaks").select("*").eq("trainer_id", trainerId),
        supabase.from("client_workout_status").select("*").eq("trainer_id", trainerId),
      ]);
      if (streaksRes.error) throw streaksRes.error;
      if (statusRes.error) throw statusRes.error;

      const streakByKey = new Map<string, number>();
      streaksRes.data.forEach((r) => {
        streakByKey.set(r.client_id ?? `m:${r.managed_client_id}`, r.current_streak);
      });
      const statusByKey = new Map<string, (typeof statusRes.data)[number]>();
      statusRes.data.forEach((r) => {
        statusByKey.set(r.client_id ?? `m:${r.managed_client_id}`, r);
      });
      return { streakByKey, statusByKey };
    },
  });

  // Trainer-only: mark an offline (managed) client's oldest due-or-overdue
  // workout as completed. Offline clients have no app account, so this is the
  // only way their scheduled_workouts.status ever becomes 'completed'.
  const markComplete = useMutation({
    mutationFn: async (scheduledWorkoutId: string) => {
      const { error } = await supabase
        .from("scheduled_workouts")
        .update({ status: "completed" })
        .eq("id", scheduledWorkoutId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-status"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-trainer"] });
    },
  });

  // Client's upcoming scheduled workouts (today onward).
  const upcoming = useQuery({
    queryKey: ["scheduled-client"],
    enabled: !isTrainer && !!session,
    queryFn: async () => {
      const { data: sws, error } = await supabase
        .from("scheduled_workouts")
        .select("*")
        .eq("client_id", session!.user.id)
        .gte("scheduled_date", todayISO())
        .order("scheduled_date")
        .order("scheduled_time", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const tplIds = [...new Set(sws.map((s) => s.template_id).filter(Boolean) as string[])];
      const tNames = new Map<string, string>();
      if (tplIds.length > 0) {
        const { data } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
        data?.forEach((t) => tNames.set(t.id, t.name));
      }
      return sws.map((s) => ({
        ...s,
        template_name: s.template_id ? tNames.get(s.template_id) ?? "Workout" : "Workout",
      }));
    },
  });

  // Client can nudge a workout's date a day at a time (for training on their own
  // schedule). RLS lets a client update their own scheduled workouts.
  const shift = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await supabase.from("scheduled_workouts").update({ scheduled_date: date }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scheduled-client"] }),
  });
  function shiftDay(s: { id: string; scheduled_date: string }, delta: number) {
    const next = addDays(s.scheduled_date, delta);
    if (delta < 0 && next < todayISO()) return; // never move before today
    shift.mutate({ id: s.id, date: next });
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 pt-6">
        <Text className="text-2xl font-bold text-slate-900">
          Hi {profile?.display_name ?? ""} 👋
        </Text>
        <Text className="mt-1 text-base text-slate-500">
          {isTrainer ? "Trainer dashboard" : "Your upcoming workouts"}
        </Text>

        {isTrainer ? (
          <View className="mt-6 pb-6">
            {dashboard.error ? (
              <Text className="mb-3 text-sm text-red-600">{(dashboard.error as Error).message}</Text>
            ) : null}
            {roster.isLoading || dashboard.isLoading ? (
              <ActivityIndicator />
            ) : roster.data && roster.data.length > 0 ? (
              <View className="gap-3">
                {roster.data.map((c) => {
                  const status = dashboard.data?.statusByKey.get(rosterKey(c.kind, c.refId));
                  const streak = dashboard.data?.streakByKey.get(rosterKey(c.kind, c.refId)) ?? 0;
                  return (
                    <View
                      key={`${c.kind}-${c.refId}`}
                      className="rounded-xl border border-slate-200 px-4 py-3"
                    >
                      <Link href={`/dashboard/${c.refId}?kind=${c.kind}`} asChild>
                        <Pressable className="active:opacity-70">
                          <View className="flex-row items-center justify-between">
                            <Text className="text-base font-semibold text-slate-900">{c.name}</Text>
                            {status?.completed_today ? (
                              <Text className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                ✓ Done today
                              </Text>
                            ) : status?.is_overdue ? (
                              <Text className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                ⚠ Overdue
                              </Text>
                            ) : status?.has_workout_today ? (
                              <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                Due today
                              </Text>
                            ) : (
                              <Text className="text-xs text-slate-400">—</Text>
                            )}
                          </View>
                          <View className="mt-1 flex-row items-center gap-2">
                            <Text className="text-sm text-slate-500">🔥 {streak} streak</Text>
                            {c.kind === "managed" ? (
                              <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                offline
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                      </Link>
                      {c.kind === "managed" && status?.actionable_id ? (
                        <Pressable
                          className="mt-2 items-center self-start rounded-lg border border-slate-300 px-3 py-1.5 active:bg-slate-100"
                          disabled={markComplete.isPending}
                          onPress={() => markComplete.mutate(status.actionable_id!)}
                        >
                          <Text className="text-xs font-semibold text-slate-700">Mark complete</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
                <Text className="text-center text-base font-medium text-slate-700">No clients yet</Text>
                <Text className="mt-2 text-center text-sm text-slate-400">
                  Add clients from the Schedule tab to see their status here.
                </Text>
              </View>
            )}
          </View>
        ) : upcoming.isLoading ? (
          <View className="mt-10">
            <ActivityIndicator />
          </View>
        ) : upcoming.data && upcoming.data.length > 0 ? (
          <View className="mt-6 gap-3 pb-6">
            {upcoming.data.map((s) => {
              const done = s.status === "completed";
              const withTrainer = s.with_trainer;
              const card = (
                <Link href={`/workout/${s.id}`} asChild>
                  <Pressable
                    className={`rounded-xl px-4 py-3 ${
                      withTrainer
                        ? "border-2 border-indigo-500 bg-indigo-50 active:opacity-90"
                        : "flex-1 border border-slate-200 bg-white active:bg-slate-50"
                    }`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className={`text-base font-bold ${withTrainer ? "text-indigo-900" : "text-slate-900"}`}>
                        {s.template_name}
                      </Text>
                      {done ? (
                        <Text className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Done ✓
                        </Text>
                      ) : withTrainer ? (
                        <Text className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
                          💪 With trainer
                        </Text>
                      ) : isToday(s.scheduled_date) ? (
                        <Text className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                          Today
                        </Text>
                      ) : null}
                    </View>
                    <Text className={`mt-0.5 text-sm ${withTrainer ? "text-indigo-700" : "text-slate-500"}`}>
                      {formatDisplayDate(s.scheduled_date)}
                      {s.scheduled_time ? ` · ${s.scheduled_time.slice(0, 5)}` : ""}
                    </Text>
                    {s.notes ? <Text className="mt-1 text-sm text-slate-400">“{s.notes}”</Text> : null}
                  </Pressable>
                </Link>
              );

              // Trainer-led: fixed (no shift arrows). Solo: client can nudge ±1 day.
              if (withTrainer) return <View key={s.id}>{card}</View>;
              return (
                <View key={s.id} className="flex-row items-center gap-2">
                  <ShiftBtn
                    label="◀"
                    disabled={done || isToday(s.scheduled_date) || shift.isPending}
                    onPress={() => shiftDay(s, -1)}
                  />
                  {card}
                  <ShiftBtn label="▶" disabled={done || shift.isPending} onPress={() => shiftDay(s, 1)} />
                </View>
              );
            })}
          </View>
        ) : (
          <View className="mt-8 items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
            <Text className="text-center text-base font-medium text-slate-700">
              No workouts scheduled yet
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-400">
              Your trainer will assign your first workout soon.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ShiftBtn({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`h-10 w-9 items-center justify-center rounded-lg border ${
        disabled ? "border-slate-200" : "border-slate-300 active:bg-slate-100"
      }`}
    >
      <Text className={`text-base ${disabled ? "text-slate-300" : "text-slate-700"}`}>{label}</Text>
    </Pressable>
  );
}

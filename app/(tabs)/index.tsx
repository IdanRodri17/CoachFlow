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
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
import { addDays, formatDisplayDate, isToday, todayISO } from "@/lib/dates";

// Every roster member is keyed by client_id for app clients, or "m:<id>" for
// offline/managed clients — matches the subject_key the dashboard views use.
function rosterKey(kind: "app" | "managed", refId: string) {
  return kind === "app" ? refId : `m:${refId}`;
}

function formatMoney(value: number, locale: string) {
  return new Intl.NumberFormat(locale === "he" ? "he" : "en").format(Math.round(value));
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const isTrainer = profile?.role === "trainer";
  const trainerId = session?.user.id ?? "";

  const roster = useRosterClients(trainerId, { enabled: isTrainer && !!session });

  // V13: cash-flow card — reads the CURRENT month's row from the
  // trainer_monthly_money view (0014_money.sql), never computed in app code.
  const currentMonthKey = `${todayISO().slice(0, 7)}-01`;
  const money = useQuery({
    queryKey: ["trainer-monthly-money", currentMonthKey],
    enabled: isTrainer && !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_monthly_money")
        .select("*")
        .eq("trainer_id", trainerId)
        .eq("month", currentMonthKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const dashboard = useQuery({
    queryKey: ["dashboard-status"],
    enabled: isTrainer && !!session,
    queryFn: async () => {
      const [streaksRes, statusRes, unpaidRes] = await Promise.all([
        supabase.from("client_streaks").select("*").eq("trainer_id", trainerId),
        supabase.from("client_workout_status").select("*").eq("trainer_id", trainerId),
        // Payment reminder (V10 add-on): completed-but-unpaid sessions, grouped
        // per client here in app code — a simple count doesn't need a SQL view.
        supabase
          .from("scheduled_workouts")
          .select("client_id, managed_client_id")
          .eq("trainer_id", trainerId)
          .eq("status", "completed")
          .eq("paid", false),
      ]);
      if (streaksRes.error) throw streaksRes.error;
      if (statusRes.error) throw statusRes.error;
      if (unpaidRes.error) throw unpaidRes.error;

      const streakByKey = new Map<string, number>();
      streaksRes.data.forEach((r) => {
        streakByKey.set(r.client_id ?? `m:${r.managed_client_id}`, r.current_streak);
      });
      const statusByKey = new Map<string, (typeof statusRes.data)[number]>();
      statusRes.data.forEach((r) => {
        statusByKey.set(r.client_id ?? `m:${r.managed_client_id}`, r);
      });
      const unpaidByKey = new Map<string, number>();
      unpaidRes.data.forEach((r) => {
        const key = r.client_id ?? `m:${r.managed_client_id}`;
        unpaidByKey.set(key, (unpaidByKey.get(key) ?? 0) + 1);
      });
      return { streakByKey, statusByKey, unpaidByKey };
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
        <Text className="w-full text-left text-2xl font-bold text-slate-900">
          {t("home.greeting", { name: profile?.display_name ?? "" })}
        </Text>
        <Text className="mt-1 w-full text-left text-base text-slate-500">
          {isTrainer ? t("home.trainerSubtitle") : t("home.clientSubtitle")}
        </Text>

        {isTrainer ? (
          <View className="mt-6 pb-6">
            <View className="mb-4 rounded-2xl border border-slate-200 p-4">
              <Text className="w-full text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("home.money.title")}
              </Text>
              {money.isLoading ? (
                <ActivityIndicator className="mt-3" />
              ) : money.error ? (
                <Text className="mt-2 w-full text-left text-xs text-red-600">
                  {(money.error as Error).message}
                </Text>
              ) : (
                <>
                  <View className="mt-3 flex-row gap-4">
                    <MoneyStat
                      label={t("home.money.earned")}
                      value={formatMoney(money.data?.earned ?? 0, i18n.language)}
                    />
                    <MoneyStat
                      label={t("home.money.projected")}
                      value={formatMoney(money.data?.projected ?? 0, i18n.language)}
                    />
                    <MoneyStat
                      label={t("home.money.unpaid")}
                      value={formatMoney(money.data?.unpaid ?? 0, i18n.language)}
                      accent
                    />
                  </View>
                  {money.data && money.data.clients_without_price > 0 ? (
                    <Text className="mt-3 w-full text-left text-xs text-amber-600">
                      {t("home.money.priceGapHint", { count: money.data.clients_without_price })}
                    </Text>
                  ) : null}
                </>
              )}
            </View>

            {dashboard.error ? (
              <Text className="mb-3 w-full text-left text-sm text-red-600">
                {(dashboard.error as Error).message}
              </Text>
            ) : null}
            {roster.isLoading || dashboard.isLoading ? (
              <ActivityIndicator />
            ) : roster.data && roster.data.length > 0 ? (
              <View className="gap-3">
                {roster.data.map((c) => {
                  const status = dashboard.data?.statusByKey.get(rosterKey(c.kind, c.refId));
                  const streak = dashboard.data?.streakByKey.get(rosterKey(c.kind, c.refId)) ?? 0;
                  const unpaidCount = dashboard.data?.unpaidByKey.get(rosterKey(c.kind, c.refId)) ?? 0;
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
                                {t("home.doneToday")}
                              </Text>
                            ) : status?.is_overdue ? (
                              <Text className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                {t("home.overdue")}
                              </Text>
                            ) : status?.has_workout_today ? (
                              <Text className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                {t("home.dueToday")}
                              </Text>
                            ) : (
                              <Text className="text-xs text-slate-400">—</Text>
                            )}
                          </View>
                          <View className="mt-1 flex-row items-center gap-2">
                            <Text className="text-sm text-slate-500">{t("home.streak", { count: streak })}</Text>
                            {c.kind === "managed" ? (
                              <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                {t("home.offline")}
                              </Text>
                            ) : null}
                            {unpaidCount > 0 ? (
                              <Text className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-800">
                                {t("home.unpaid", { count: unpaidCount })}
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
                          <Text className="text-xs font-semibold text-slate-700">{t("home.markComplete")}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View className="items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
                <Text className="text-center text-base font-medium text-slate-700">{t("home.noClientsYet")}</Text>
                <Text className="mt-2 text-center text-sm text-slate-400">{t("home.noClientsHint")}</Text>
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
                          {t("home.done")}
                        </Text>
                      ) : withTrainer ? (
                        <Text className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
                          {t("home.withTrainer")}
                        </Text>
                      ) : isToday(s.scheduled_date) ? (
                        <Text className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                          {t("home.today")}
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
            <Text className="w-full text-center text-base font-medium text-slate-700">
              {t("home.noWorkoutsYet")}
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-400">{t("home.noWorkoutsHint")}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MoneyStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View className="flex-1">
      <Text className="w-full text-left text-xs text-slate-400">{label}</Text>
      <Text className={`mt-0.5 w-full text-left text-base font-semibold ${accent ? "text-red-600" : "text-slate-900"}`}>
        ₪{value}
      </Text>
    </View>
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

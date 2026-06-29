// app/(tabs)/index.tsx — the Home tab (route: /).
//
// Client: a greeting + their UPCOMING scheduled workouts (date + template name).
// Trainer: a greeting + a pointer to the Schedule tab (their real dashboard is V8).

import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, isToday, todayISO } from "@/lib/dates";

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const isTrainer = profile?.role === "trainer";

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
          <View className="mt-8 items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
            <Text className="text-center text-base font-medium text-slate-700">
              Your dashboard arrives in a later step
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-400">
              For now, use the Schedule tab to add clients and assign workouts.
            </Text>
          </View>
        ) : upcoming.isLoading ? (
          <View className="mt-10">
            <ActivityIndicator />
          </View>
        ) : upcoming.data && upcoming.data.length > 0 ? (
          <View className="mt-6 gap-3 pb-6">
            {upcoming.data.map((s) => (
              <View key={s.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-semibold text-slate-900">{s.template_name}</Text>
                  {isToday(s.scheduled_date) ? (
                    <Text className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                      Today
                    </Text>
                  ) : null}
                </View>
                <Text className="mt-0.5 text-sm text-slate-500">
                  {formatDisplayDate(s.scheduled_date)}
                  {s.scheduled_time ? ` · ${s.scheduled_time.slice(0, 5)}` : ""}
                </Text>
                {s.notes ? <Text className="mt-1 text-sm text-slate-400">“{s.notes}”</Text> : null}
              </View>
            ))}
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

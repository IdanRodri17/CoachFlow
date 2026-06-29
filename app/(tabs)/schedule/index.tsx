// app/(tabs)/schedule/index.tsx — the trainer's roster + scheduling hub.
//
// Sections:
//   1. Add a client to the roster by email (uses the add_client_by_email RPC).
//   2. The current roster.
//   3. A button to schedule a workout.
//   4. Upcoming scheduled workouts (so the trainer sees what they've assigned).

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, todayISO } from "@/lib/dates";

export default function ScheduleHomeScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");

  if (profile && profile.role !== "trainer") return <Redirect href="/" />;
  const trainerId = session!.user.id;

  // --- roster ---
  const roster = useQuery({
    queryKey: ["roster"],
    queryFn: async () => {
      const { data: tc, error } = await supabase
        .from("trainer_clients")
        .select("*")
        .eq("trainer_id", trainerId)
        .order("created_at");
      if (error) throw error;
      const ids = tc.map((r) => r.client_id);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", ids);
        if (pErr) throw pErr;
        profs.forEach((p) => names.set(p.id, p.display_name));
      }
      return tc.map((r) => ({ ...r, name: names.get(r.client_id) ?? "Client" }));
    },
  });

  // --- upcoming (trainer view) ---
  const upcoming = useQuery({
    queryKey: ["scheduled-trainer"],
    queryFn: async () => {
      const { data: sws, error } = await supabase
        .from("scheduled_workouts")
        .select("*")
        .eq("trainer_id", trainerId)
        .gte("scheduled_date", todayISO())
        .order("scheduled_date");
      if (error) throw error;

      const clientIds = [...new Set(sws.map((s) => s.client_id))];
      const tplIds = [...new Set(sws.map((s) => s.template_id).filter(Boolean) as string[])];
      const cNames = new Map<string, string>();
      const tNames = new Map<string, string>();
      if (clientIds.length > 0) {
        const { data } = await supabase.from("profiles").select("id, display_name").in("id", clientIds);
        data?.forEach((p) => cNames.set(p.id, p.display_name));
      }
      if (tplIds.length > 0) {
        const { data } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
        data?.forEach((t) => tNames.set(t.id, t.name));
      }
      return sws.map((s) => ({
        ...s,
        client_name: cNames.get(s.client_id) ?? "Client",
        template_name: s.template_id ? tNames.get(s.template_id) ?? "Workout" : "Workout",
      }));
    },
  });

  const addClient = useMutation({
    mutationFn: async (rawEmail: string) => {
      const { error } = await supabase.rpc("add_client_by_email", { p_email: rawEmail });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster"] });
      setEmail("");
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        {/* 1. Add a client */}
        <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add a client
        </Text>
        <View className="flex-row gap-2">
          <TextInput
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
            placeholder="client@email.com"
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!addClient.isPending}
          />
          <Pressable
            className="items-center justify-center rounded-xl bg-slate-900 px-4 active:opacity-80"
            disabled={addClient.isPending || email.trim().length === 0}
            onPress={() => addClient.mutate(email.trim())}
          >
            {addClient.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">Add</Text>
            )}
          </Pressable>
        </View>
        {addClient.error ? (
          <Text className="mt-2 text-sm text-red-600">{(addClient.error as Error).message}</Text>
        ) : null}
        <Text className="mt-2 text-xs text-slate-400">
          The client must have signed up in the app first.
        </Text>

        {/* 2. Roster */}
        <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your clients ({roster.data?.length ?? 0})
        </Text>
        {roster.isLoading ? (
          <ActivityIndicator />
        ) : roster.data && roster.data.length > 0 ? (
          <View className="gap-2">
            {roster.data.map((c) => (
              <View key={c.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <Text className="text-base font-medium text-slate-900">{c.name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-slate-400">No clients yet — add one above.</Text>
        )}

        {/* 3. Schedule a workout */}
        <Pressable
          className="mt-7 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
          onPress={() => router.push("/schedule/new")}
        >
          <Text className="text-base font-semibold text-white">Schedule a workout</Text>
        </Pressable>

        {/* 4. Upcoming */}
        <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Upcoming
        </Text>
        {upcoming.isLoading ? (
          <ActivityIndicator />
        ) : upcoming.data && upcoming.data.length > 0 ? (
          <View className="gap-2">
            {upcoming.data.map((s) => (
              <View key={s.id} className="rounded-xl border border-slate-200 px-4 py-3">
                <Text className="text-base font-semibold text-slate-900">{s.template_name}</Text>
                <Text className="mt-0.5 text-sm text-slate-500">
                  {s.client_name} · {formatDisplayDate(s.scheduled_date)}
                </Text>
                {s.notes ? <Text className="mt-1 text-sm text-slate-400">“{s.notes}”</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-slate-400">Nothing scheduled yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

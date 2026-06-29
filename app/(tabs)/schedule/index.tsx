// app/(tabs)/schedule/index.tsx — the trainer's roster + scheduling hub.
//
// Roster has two kinds of client:
//   - app clients: added by email (must have signed up) via add_client_by_email
//   - offline clients: added by name only (managed_clients) — won't use the app
// Both can be scheduled. Sections: add app client, add offline client, roster,
// schedule button, upcoming.

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
import { formatDisplayDate, todayISO } from "@/lib/dates";

export default function ScheduleHomeScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [offlineName, setOfflineName] = useState("");

  if (profile && profile.role !== "trainer") return <Redirect href="/" />;
  const trainerId = session!.user.id;

  const roster = useRosterClients(trainerId);

  // Upcoming (trainer view), resolving names for app + managed clients.
  const upcoming = useQuery({
    queryKey: ["scheduled-trainer"],
    queryFn: async () => {
      const { data: sws, error } = await supabase
        .from("scheduled_workouts")
        .select("*")
        .eq("trainer_id", trainerId)
        .gte("scheduled_date", todayISO())
        .order("scheduled_date")
        .order("scheduled_time", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const clientIds = [...new Set(sws.map((s) => s.client_id).filter(Boolean) as string[])];
      const managedIds = [...new Set(sws.map((s) => s.managed_client_id).filter(Boolean) as string[])];
      const tplIds = [...new Set(sws.map((s) => s.template_id).filter(Boolean) as string[])];
      const cNames = new Map<string, string>();
      const mNames = new Map<string, string>();
      const tNames = new Map<string, string>();
      if (clientIds.length > 0) {
        const { data } = await supabase.from("profiles").select("id, display_name").in("id", clientIds);
        data?.forEach((p) => cNames.set(p.id, p.display_name));
      }
      if (managedIds.length > 0) {
        const { data } = await supabase.from("managed_clients").select("id, name").in("id", managedIds);
        data?.forEach((m) => mNames.set(m.id, m.name));
      }
      if (tplIds.length > 0) {
        const { data } = await supabase.from("workout_templates").select("id, name").in("id", tplIds);
        data?.forEach((t) => tNames.set(t.id, t.name));
      }
      return sws.map((s) => ({
        ...s,
        client_name: s.client_id
          ? cNames.get(s.client_id) ?? "Client"
          : s.managed_client_id
            ? mNames.get(s.managed_client_id) ?? "Client"
            : "Client",
        template_name: s.template_id ? tNames.get(s.template_id) ?? "Workout" : "Workout",
      }));
    },
  });

  const addAppClient = useMutation({
    mutationFn: async (rawEmail: string) => {
      const { error } = await supabase.rpc("add_client_by_email", { p_email: rawEmail });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-clients"] });
      setEmail("");
    },
  });

  const addOfflineClient = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("managed_clients").insert({ trainer_id: trainerId, name });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster-clients"] });
      setOfflineName("");
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        {/* Add an app client */}
        <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add a client (uses the app)
        </Text>
        <AddRow
          value={email}
          onChangeText={setEmail}
          placeholder="client@email.com"
          keyboardType="email-address"
          busy={addAppClient.isPending}
          onAdd={() => addAppClient.mutate(email.trim())}
        />
        {addAppClient.error ? (
          <Text className="mt-2 text-sm text-red-600">{(addAppClient.error as Error).message}</Text>
        ) : null}
        <Text className="mt-2 text-xs text-slate-400">They must have signed up in the app first.</Text>

        {/* Add an offline client */}
        <Text className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Add an offline client (no app)
        </Text>
        <AddRow
          value={offlineName}
          onChangeText={setOfflineName}
          placeholder="Client name"
          busy={addOfflineClient.isPending}
          onAdd={() => addOfflineClient.mutate(offlineName.trim())}
        />
        {addOfflineClient.error ? (
          <Text className="mt-2 text-sm text-red-600">{(addOfflineClient.error as Error).message}</Text>
        ) : null}

        {/* Roster */}
        <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your clients ({roster.data?.length ?? 0})
        </Text>
        {roster.isLoading ? (
          <ActivityIndicator />
        ) : roster.data && roster.data.length > 0 ? (
          <View className="gap-2">
            {roster.data.map((c) => (
              <View
                key={`${c.kind}-${c.refId}`}
                className="flex-row items-center justify-between rounded-xl border border-slate-200 px-4 py-3"
              >
                <Text className="text-base font-medium text-slate-900">{c.name}</Text>
                {c.kind === "managed" ? (
                  <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                    offline
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-slate-400">No clients yet — add one above.</Text>
        )}

        {/* Schedule a workout */}
        <Pressable
          className="mt-7 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
          onPress={() => router.push("/schedule/new")}
        >
          <Text className="text-base font-semibold text-white">Schedule a workout</Text>
        </Pressable>

        {/* Upcoming */}
        <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Upcoming
        </Text>
        {upcoming.isLoading ? (
          <ActivityIndicator />
        ) : upcoming.data && upcoming.data.length > 0 ? (
          <View className="gap-2">
            {upcoming.data.map((s) => (
              <Link key={s.id} href={`/schedule/${s.id}`} asChild>
                <Pressable className="rounded-xl border border-slate-200 px-4 py-3 active:bg-slate-50">
                  <Text className="text-base font-semibold text-slate-900">{s.template_name}</Text>
                  <Text className="mt-0.5 text-sm text-slate-500">
                    {s.client_name} · {formatDisplayDate(s.scheduled_date)}
                    {s.scheduled_time ? ` · ${s.scheduled_time.slice(0, 5)}` : ""}
                  </Text>
                  {s.notes ? <Text className="mt-1 text-sm text-slate-400">“{s.notes}”</Text> : null}
                </Pressable>
              </Link>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-slate-400">Nothing scheduled yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// An input + Add button row.
function AddRow({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  busy,
  onAdd,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: "email-address" | "default";
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <View className="flex-row gap-2">
      <TextInput
        className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        autoCorrect={false}
        keyboardType={keyboardType ?? "default"}
        value={value}
        onChangeText={onChangeText}
        editable={!busy}
      />
      <Pressable
        className="items-center justify-center rounded-xl bg-slate-900 px-4 active:opacity-80"
        disabled={busy || value.trim().length === 0}
        onPress={onAdd}
      >
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text className="text-base font-semibold text-white">Add</Text>
        )}
      </Pressable>
    </View>
  );
}

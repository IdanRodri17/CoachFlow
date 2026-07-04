// app/(tabs)/checkin.tsx — the client's weekly check-in tab (V10).
//
// A 30-second weekly pulse: sleep / energy / soreness / adherence (1-5) +
// an optional note. Once per week — week_start is the Sunday of the current
// week (Asia/Jerusalem, lib/dates.ts weekStartOf), matching the DB's
// unique(client_id, week_start) constraint. Already submitted this week ->
// read-only summary instead of the form. History below shows past check-ins.

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate, todayISO, weekStartOf } from "@/lib/dates";

const FIELDS = [
  { key: "sleep", label: "Sleep" },
  { key: "energy", label: "Energy" },
  { key: "soreness", label: "Soreness" },
  { key: "adherence", label: "Adherence" },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

export default function CheckinScreen() {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<FieldKey, number>>({
    sleep: 3,
    energy: 3,
    soreness: 3,
    adherence: 3,
  });
  const [note, setNote] = useState("");

  if (profile && profile.role !== "client") return <Redirect href="/" />;
  const clientId = session!.user.id;
  const thisWeek = weekStartOf(todayISO());

  const history = useQuery({
    queryKey: ["check-ins", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("check_ins")
        .select("*")
        .eq("client_id", clientId)
        .order("week_start", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("check_ins").insert({
        client_id: clientId,
        week_start: thisWeek,
        sleep: values.sleep,
        energy: values.energy,
        soreness: values.soreness,
        adherence: values.adherence,
        note: note.trim() === "" ? null : note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["check-ins", clientId] }),
  });

  if (history.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const current = history.data?.find((c) => c.week_start === thisWeek) ?? null;
  const past = (history.data ?? []).filter((c) => c.week_start !== thisWeek);

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6">
        <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          This week
        </Text>

        {current ? (
          <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <Text className="text-sm font-semibold text-emerald-800">
              ✓ You checked in for this week
            </Text>
            <View className="mt-3 gap-1.5">
              {FIELDS.map((f) => (
                <Text key={f.key} className="text-sm text-emerald-900">
                  {f.label}: {current[f.key]}/5
                </Text>
              ))}
            </View>
            {current.note ? (
              <Text className="mt-2 text-sm text-emerald-700">“{current.note}”</Text>
            ) : null}
          </View>
        ) : (
          <View className="rounded-2xl border border-slate-200 p-4">
            <View className="gap-4">
              {FIELDS.map((f) => (
                <View key={f.key}>
                  <Text className="mb-1.5 text-sm font-medium text-slate-700">{f.label}</Text>
                  <ScaleSelector
                    value={values[f.key]}
                    onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                  />
                </View>
              ))}
            </View>

            <Text className="mb-1.5 mt-4 text-sm font-medium text-slate-700">Note (optional)</Text>
            <TextInput
              className="rounded-lg border border-slate-300 px-3 py-2 text-base text-slate-900"
              placeholder="Anything your trainer should know?"
              placeholderTextColor="#94a3b8"
              value={note}
              onChangeText={setNote}
              multiline
            />

            {submit.error ? (
              <Text className="mt-2 text-sm text-red-600">{(submit.error as Error).message}</Text>
            ) : null}

            <Pressable
              className="mt-4 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
              disabled={submit.isPending}
              onPress={() => submit.mutate()}
            >
              {submit.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text className="text-base font-semibold text-white">Submit check-in</Text>
              )}
            </Pressable>
          </View>
        )}

        <Text className="mb-2 mt-7 text-sm font-semibold uppercase tracking-wide text-slate-500">
          History
        </Text>
        {past.length > 0 ? (
          <View className="gap-2">
            {past.map((c) => (
              <View key={c.id} className="rounded-xl border border-slate-200 p-3">
                <Text className="text-sm font-semibold text-slate-900">
                  Week of {formatDisplayDate(c.week_start)}
                </Text>
                <Text className="mt-1 text-sm text-slate-500">
                  {FIELDS.map((f) => `${f.label} ${c[f.key]}`).join(" · ")}
                </Text>
                {c.note ? <Text className="mt-1 text-sm text-slate-400">“{c.note}”</Text> : null}
              </View>
            ))}
          </View>
        ) : (
          <Text className="text-sm text-slate-400">No past check-ins yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ScaleSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View className="flex-row gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          onPress={() => onChange(n)}
          className={`h-10 flex-1 items-center justify-center rounded-lg border ${
            n === value ? "border-slate-900 bg-slate-900" : "border-slate-300 active:bg-slate-100"
          }`}
        >
          <Text className={`text-base font-semibold ${n === value ? "text-white" : "text-slate-700"}`}>
            {n}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

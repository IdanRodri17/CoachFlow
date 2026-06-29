// app/(tabs)/schedule/new.tsx — assign a template to a client on a date.
//
// The client picker lists BOTH app clients and offline (managed) clients. On
// submit we set client_id for an app client, or managed_client_id for an offline
// one (the DB enforces exactly one). All dates via lib/dates.ts (Asia/Jerusalem).

import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients, type RosterClient } from "@/lib/useRoster";
import { addDays, todayISO } from "@/lib/dates";
import { DateChips } from "@/components/DateChips";

export default function NewScheduleScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<RosterClient | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(addDays(todayISO(), 1)); // default: tomorrow
  const [note, setNote] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  if (profile && profile.role !== "trainer") return <Redirect href="/" />;
  const trainerId = session!.user.id;

  const roster = useRosterClients(trainerId);

  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("id, name")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("scheduled_workouts").insert({
        trainer_id: trainerId,
        client_id: selected!.kind === "app" ? selected!.refId : null,
        managed_client_id: selected!.kind === "managed" ? selected!.refId : null,
        template_id: templateId,
        scheduled_date: date,
        notes: note.trim().length > 0 ? note.trim() : null,
        status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-trainer"] });
      router.back();
    },
  });

  function handleSubmit() {
    if (!selected) return setValidationError("Pick a client.");
    if (!templateId) return setValidationError("Pick a template.");
    setValidationError(null);
    mutation.mutate();
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6" keyboardShouldPersistTaps="handled">
        {/* Client */}
        <Section label="Client">
          {roster.isLoading ? (
            <ActivityIndicator />
          ) : roster.data && roster.data.length > 0 ? (
            <View className="gap-2">
              {roster.data.map((c) => (
                <SelectRow
                  key={`${c.kind}-${c.refId}`}
                  label={c.name}
                  tag={c.kind === "managed" ? "offline" : undefined}
                  selected={selected?.kind === c.kind && selected?.refId === c.refId}
                  onPress={() => setSelected(c)}
                />
              ))}
            </View>
          ) : (
            <Text className="text-sm text-slate-400">
              No clients yet — add one on the Schedule screen first.
            </Text>
          )}
        </Section>

        {/* Template */}
        <Section label="Template">
          {templates.isLoading ? (
            <ActivityIndicator />
          ) : templates.data && templates.data.length > 0 ? (
            <View className="gap-2">
              {templates.data.map((t) => (
                <SelectRow
                  key={t.id}
                  label={t.name}
                  selected={templateId === t.id}
                  onPress={() => setTemplateId(t.id)}
                />
              ))}
            </View>
          ) : (
            <Text className="text-sm text-slate-400">
              No templates yet — build one in the Templates tab.
            </Text>
          )}
        </Section>

        {/* Date */}
        <Section label="Date">
          <DateChips value={date} onChange={setDate} />
        </Section>

        {/* Note */}
        <Section label="Note for this workout (optional)">
          <TextInput
            className="rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
            placeholder="e.g. Today's lighter — focus on form."
            placeholderTextColor="#94a3b8"
            value={note}
            onChangeText={setNote}
            editable={!mutation.isPending}
            multiline
          />
        </Section>

        {validationError || mutation.error ? (
          <Text className="mb-3 text-sm text-red-600">
            {validationError ?? (mutation.error as Error).message}
          </Text>
        ) : null}

        <Pressable
          className="mt-2 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
          disabled={mutation.isPending}
          onPress={handleSubmit}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">Assign workout</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</Text>
      {children}
    </View>
  );
}

function SelectRow({
  label,
  tag,
  selected,
  onPress,
}: {
  label: string;
  tag?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between rounded-xl border px-4 py-3 ${
        selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-base font-medium text-slate-900">{label}</Text>
        {tag ? (
          <Text className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {tag}
          </Text>
        ) : null}
      </View>
      {selected ? <Text className="text-base font-bold text-slate-900">✓</Text> : null}
    </Pressable>
  );
}

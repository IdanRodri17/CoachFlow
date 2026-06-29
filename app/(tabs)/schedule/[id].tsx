// app/(tabs)/schedule/[id].tsx — edit a scheduled workout (trainer only).
//
// Lets the trainer "complete the details later": change the client, add/swap the
// template, set a time, edit the note — or delete it. Reuses ScheduleForm.

import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
import {
  ScheduleForm,
  type ScheduleFormInitial,
  type SchedulePayload,
} from "@/components/ScheduleForm";

export default function EditScheduleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

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

  const workout = useQuery({
    queryKey: ["scheduled", id],
    queryFn: async (): Promise<ScheduleFormInitial> => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return {
        client: data.client_id
          ? { kind: "app", refId: data.client_id }
          : { kind: "managed", refId: data.managed_client_id! },
        templateId: data.template_id,
        date: data.scheduled_date,
        time: data.scheduled_time ? data.scheduled_time.slice(0, 5) : null, // "HH:MM:SS" -> "HH:MM"
        note: data.notes,
      };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: SchedulePayload) => {
      let client_id: string | null = null;
      let managed_client_id: string | null = null;
      if (payload.client.mode === "new") {
        const { data, error } = await supabase
          .from("managed_clients")
          .insert({ trainer_id: trainerId, name: payload.client.name })
          .select("id")
          .single();
        if (error) throw error;
        managed_client_id = data.id;
      } else if (payload.client.kind === "app") {
        client_id = payload.client.refId;
      } else {
        managed_client_id = payload.client.refId;
      }

      const { error } = await supabase
        .from("scheduled_workouts")
        .update({
          client_id,
          managed_client_id,
          template_id: payload.templateId,
          scheduled_date: payload.date,
          scheduled_time: payload.time,
          notes: payload.note,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-trainer"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled", id] });
      queryClient.invalidateQueries({ queryKey: ["roster-clients"] });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("scheduled_workouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-trainer"] });
      router.back();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete workout", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  if (workout.isLoading || roster.isLoading || templates.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (workout.error || !workout.data) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-sm text-red-600">
          {workout.error ? (workout.error as Error).message : "Workout not found."}
        </Text>
      </View>
    );
  }

  return (
    <ScheduleForm
      roster={roster.data ?? []}
      templates={templates.data ?? []}
      loadingRoster={false}
      loadingTemplates={false}
      initial={workout.data}
      submitLabel="Save changes"
      submitting={updateMutation.isPending}
      errorMessage={updateMutation.error ? (updateMutation.error as Error).message : null}
      onSubmit={(payload) => updateMutation.mutate(payload)}
      footer={
        <Pressable
          className="items-center rounded-xl border border-red-300 px-4 py-3 active:opacity-70"
          disabled={deleteMutation.isPending}
          onPress={confirmDelete}
        >
          <Text className="text-base font-semibold text-red-600">Delete workout</Text>
        </Pressable>
      }
    />
  );
}

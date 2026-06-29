// app/(tabs)/exercises/[id].tsx — view one exercise.
//
// Trainer: edit form (pre-filled) with a video preview on top + a delete button.
// Client: read-only details + the demo video. RLS already prevents a client from
// editing, but we also hide the controls so the UI matches their permissions.

import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ExerciseForm, type ExerciseInput } from "@/components/ExerciseForm";
import { ExerciseVideo } from "@/components/ExerciseVideo";

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const isTrainer = profile?.role === "trainer";
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: exercise, isLoading, error } = useQuery({
    queryKey: ["exercise", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: ExerciseInput) => {
      const { error } = await supabase.from("exercises").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      queryClient.invalidateQueries({ queryKey: ["exercise", id] });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      router.back();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete exercise", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !exercise) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-sm text-red-600">
          {error ? (error as Error).message : "Exercise not found."}
        </Text>
      </View>
    );
  }

  // --- Trainer: edit form (video preview header, delete footer) ---
  if (isTrainer) {
    return (
      <ExerciseForm
        initial={exercise}
        submitLabel="Save changes"
        submitting={updateMutation.isPending}
        errorMessage={updateMutation.error ? (updateMutation.error as Error).message : null}
        onSubmit={(input) => updateMutation.mutate(input)}
        header={<ExerciseVideo url={exercise.video_url} />}
        footer={
          <Pressable
            className="items-center rounded-xl border border-red-300 px-4 py-3 active:opacity-70"
            disabled={deleteMutation.isPending}
            onPress={confirmDelete}
          >
            <Text className="text-base font-semibold text-red-600">Delete exercise</Text>
          </Pressable>
        }
      />
    );
  }

  // --- Client: read-only view ---
  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6">
        <ExerciseVideo url={exercise.video_url} />

        <Text className="mt-4 text-2xl font-bold text-slate-900">{exercise.name}</Text>
        {exercise.muscle_group ? (
          <Text className="mt-1 text-base text-slate-500">{exercise.muscle_group}</Text>
        ) : null}

        {exercise.description ? (
          <Text className="mt-4 text-base leading-6 text-slate-700">{exercise.description}</Text>
        ) : null}

        {exercise.default_sets || exercise.default_reps ? (
          <Text className="mt-4 text-sm text-slate-500">
            Target: {exercise.default_sets ?? "—"} sets × {exercise.default_reps ?? "—"} reps
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

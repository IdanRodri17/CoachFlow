// app/(tabs)/templates/[id].tsx — edit an existing template (trainer only).
//
// Loads the template + its ordered exercises (with names) into the builder.
// On save it updates the template and REPLACES its template_exercises (delete +
// re-insert in the new order) — simplest correct way to persist reordering and
// added/removed rows. Also supports deleting the whole template.

import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  TemplateBuilder,
  type TemplateBuilderInitial,
  type TemplateInput,
} from "@/components/TemplateBuilder";

export default function EditTemplateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  if (profile && profile.role !== "trainer") return <Redirect href="/" />;

  // Load the template, its exercises (ordered), and the exercise names.
  const { data, isLoading, error } = useQuery({
    queryKey: ["template", id],
    queryFn: async (): Promise<TemplateBuilderInitial> => {
      const { data: tpl, error: tErr } = await supabase
        .from("workout_templates")
        .select("*")
        .eq("id", id)
        .single();
      if (tErr) throw tErr;

      const { data: tes, error: teErr } = await supabase
        .from("template_exercises")
        .select("*")
        .eq("template_id", id)
        .order("position");
      if (teErr) throw teErr;

      // Map exercise ids -> names (one extra query keeps types simple).
      const ids = tes.map((t) => t.exercise_id);
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: exs, error: exErr } = await supabase
          .from("exercises")
          .select("id, name")
          .in("id", ids);
        if (exErr) throw exErr;
        exs.forEach((e) => names.set(e.id, e.name));
      }

      return {
        name: tpl.name,
        description: tpl.description,
        notes: tpl.notes,
        items: tes.map((t) => ({
          exercise_id: t.exercise_id,
          exercise_name: names.get(t.exercise_id) ?? "Exercise",
          target_sets: t.target_sets,
          target_reps: t.target_reps,
          target_weight: t.target_weight,
          rest_seconds: t.rest_seconds,
        })),
      };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: TemplateInput) => {
      const { error: tErr } = await supabase
        .from("workout_templates")
        .update({ name: input.name, description: input.description, notes: input.notes })
        .eq("id", id);
      if (tErr) throw tErr;

      // Replace the exercise rows (handles reorder/add/remove in one go).
      const { error: delErr } = await supabase
        .from("template_exercises")
        .delete()
        .eq("template_id", id);
      if (delErr) throw delErr;

      const rows = input.items.map((it, index) => ({
        template_id: id,
        exercise_id: it.exercise_id,
        position: index,
        target_sets: it.target_sets,
        target_reps: it.target_reps,
        target_weight: it.target_weight,
        rest_seconds: it.rest_seconds,
      }));
      const { error: insErr } = await supabase.from("template_exercises").insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template", id] });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // template_exercises cascade-delete with the template.
      const { error } = await supabase.from("workout_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      router.back();
    },
  });

  function confirmDelete() {
    Alert.alert("Delete template", "This can't be undone.", [
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

  if (error || !data) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-sm text-red-600">
          {error ? (error as Error).message : "Template not found."}
        </Text>
      </View>
    );
  }

  return (
    <TemplateBuilder
      initial={data}
      submitLabel="Save changes"
      submitting={updateMutation.isPending}
      errorMessage={updateMutation.error ? (updateMutation.error as Error).message : null}
      onSubmit={(input) => updateMutation.mutate(input)}
      footer={
        <Pressable
          className="items-center rounded-xl border border-red-300 px-4 py-3 active:opacity-70"
          disabled={deleteMutation.isPending}
          onPress={confirmDelete}
        >
          <Text className="text-base font-semibold text-red-600">Delete template</Text>
        </Pressable>
      }
    />
  );
}

// app/(tabs)/exercises/new.tsx — create a new exercise (trainer only).
//
// Renders the shared ExerciseForm and, on submit, inserts a row owned by the
// current trainer. The exercises list cache is invalidated so it refreshes.

import { Redirect, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ExerciseForm, type ExerciseInput } from "@/components/ExerciseForm";

export default function NewExerciseScreen() {
  const { session, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Only trainers create exercises; clients shouldn't reach here.
  if (profile && profile.role !== "trainer") return <Redirect href="/exercises" />;

  const mutation = useMutation({
    mutationFn: async (input: ExerciseInput) => {
      const { error } = await supabase
        .from("exercises")
        .insert({ ...input, trainer_id: session!.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exercises"] });
      router.back();
    },
  });

  return (
    <ExerciseForm
      submitLabel="Create exercise"
      submitting={mutation.isPending}
      errorMessage={mutation.error ? (mutation.error as Error).message : null}
      onSubmit={(input) => mutation.mutate(input)}
    />
  );
}

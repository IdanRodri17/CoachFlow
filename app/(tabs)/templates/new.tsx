// app/(tabs)/templates/new.tsx — create a new template (trainer only).
//
// On save: insert the workout_templates row (owned by this trainer), then insert
// its template_exercises with position = array order.

import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { TemplateBuilder, type TemplateInput } from "@/components/TemplateBuilder";

export default function NewTemplateScreen() {
  return (
    <RoleGate role="trainer">
      <NewTemplateScreenBody />
    </RoleGate>
  );
}

function NewTemplateScreenBody() {
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();


  const mutation = useMutation({
    mutationFn: async (input: TemplateInput) => {
      // 1) Create the template and get its id.
      const { data: template, error: tErr } = await supabase
        .from("workout_templates")
        .insert({
          trainer_id: session!.user.id,
          name: input.name,
          description: input.description,
          notes: input.notes,
        })
        .select("id")
        .single();
      if (tErr) throw tErr;

      // 2) Insert its exercises, position = order in the list.
      const rows = input.items.map((it, index) => ({
        template_id: template.id,
        exercise_id: it.exercise_id,
        position: index,
        target_sets: it.target_sets,
        target_reps: it.target_reps,
        target_weight: it.target_weight,
        rest_seconds: it.rest_seconds,
      }));
      const { error: teErr } = await supabase.from("template_exercises").insert(rows);
      if (teErr) throw teErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.templates.all });
      router.back();
    },
  });

  return (
    <TemplateBuilder
      submitLabel={t("templates.form.createTemplate")}
      submitting={mutation.isPending}
      errorMessage={mutation.error ? (mutation.error as Error).message : null}
      onSubmit={(input) => mutation.mutate(input)}
    />
  );
}

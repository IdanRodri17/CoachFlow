// app/(tabs)/schedule/new.tsx — assign a workout (create), with optional weekly
// recurrence. If the trainer typed a one-off name we create an offline client
// first; then we insert one scheduled workout per date (a single date, or every
// chosen weekday for N weeks).

import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
import { expandScheduleDates } from "@/lib/schedule";
import { ScheduleForm, type SchedulePayload } from "@/components/ScheduleForm";

export default function NewScheduleScreen() {
  return (
    <RoleGate role="trainer">
      <NewScheduleScreenBody />
    </RoleGate>
  );
}

function NewScheduleScreenBody() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();

  const trainerId = session!.user.id;

  const roster = useRosterClients(trainerId);
  const templates = useQuery({
    queryKey: qk.templates.list,
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
    mutationFn: async (payload: SchedulePayload) => {
      // Resolve the client once (creating an offline client if a name was typed).
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

      // The same rule the form uses to show "קביעת N אימונים" — so the count
      // on the button and the rows inserted can't disagree (lib/schedule.ts,
      // unit-tested).
      const dates = expandScheduleDates(payload.date, payload.repeat);

      const rows = dates.map((d) => ({
        trainer_id: trainerId,
        client_id,
        managed_client_id,
        template_id: payload.templateId,
        scheduled_date: d,
        scheduled_time: payload.time,
        notes: payload.note,
        with_trainer: payload.withTrainer,
        status: "scheduled" as const,
      }));
      const { error } = await supabase.from("scheduled_workouts").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
      queryClient.invalidateQueries({ queryKey: qk.roster.all });
      router.back();
    },
  });

  return (
    <ScheduleForm
      roster={roster.data ?? []}
      templates={templates.data ?? []}
      loadingRoster={roster.isLoading}
      loadingTemplates={templates.isLoading}
      submitLabel={t("schedule.form.assignWorkout")}
      submitting={mutation.isPending}
      errorMessage={mutation.error ? (mutation.error as Error).message : null}
      onSubmit={(payload) => mutation.mutate(payload)}
      allowRepeat
    />
  );
}

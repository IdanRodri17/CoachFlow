// app/(tabs)/schedule/new.tsx — assign a workout (create), with optional weekly
// recurrence. If the trainer typed a one-off name we create an offline client
// first; then we insert one scheduled workout per date (a single date, or every
// chosen weekday for N weeks).

import { Redirect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
import { addDays, addMonths, weekdayOf } from "@/lib/dates";
import { ScheduleForm, type SchedulePayload } from "@/components/ScheduleForm";

export default function NewScheduleScreen() {
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

      // Build the date list: a single date, or every chosen weekday from the
      // start date until N weeks / N months later.
      let dates: string[];
      if (payload.repeat && payload.repeat.days.length > 0) {
        const { days, count, unit } = payload.repeat;
        const end = unit === "months" ? addMonths(payload.date, count) : addDays(payload.date, count * 7);
        dates = [];
        for (let d = payload.date; d < end; d = addDays(d, 1)) {
          if (days.includes(weekdayOf(d))) dates.push(d);
        }
        if (dates.length === 0) dates = [payload.date];
      } else {
        dates = [payload.date];
      }

      const rows = dates.map((d) => ({
        trainer_id: trainerId,
        client_id,
        managed_client_id,
        template_id: payload.templateId,
        scheduled_date: d,
        scheduled_time: payload.time,
        notes: payload.note,
        status: "scheduled" as const,
      }));
      const { error } = await supabase.from("scheduled_workouts").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-trainer"] });
      queryClient.invalidateQueries({ queryKey: ["roster-clients"] });
      router.back();
    },
  });

  return (
    <ScheduleForm
      roster={roster.data ?? []}
      templates={templates.data ?? []}
      loadingRoster={roster.isLoading}
      loadingTemplates={templates.isLoading}
      submitLabel="Assign workout"
      submitting={mutation.isPending}
      errorMessage={mutation.error ? (mutation.error as Error).message : null}
      onSubmit={(payload) => mutation.mutate(payload)}
      allowRepeat
    />
  );
}

// app/(tabs)/schedule/[id].tsx — edit a scheduled workout (trainer only).
//
// Lets the trainer "complete the details later": change the client, add/swap the
// template, set a time, edit the note — or delete it. Reuses ScheduleForm.
//
// V23 (Step 12): when the workout belongs to a series (0031) and later
// workouts of that series are still scheduled, saving a change to the time,
// template, note or with-trainer flag — or deleting — first asks "this
// workout only" or "this and all following". The rules (and the rule that
// completed and past workouts are never touched) live in lib/series.ts.
// A one-off, the last of a series, or a date/client-only edit behaves
// exactly as before, with no question.

import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { qk } from "@/lib/queryKeys";
import { RoleGate } from "@/components/RoleGate";
import { AppText, Button, Sheet } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useRosterClients } from "@/lib/useRoster";
import {
  applyToSeries,
  canActOnSeries,
  changedSeriesFields,
  deleteFromSeries,
  futureSiblings,
  type SeriesMember,
  type SeriesPatch,
} from "@/lib/series";
import {
  ScheduleForm,
  type ScheduleFormInitial,
  type SchedulePayload,
} from "@/components/ScheduleForm";

/** What the series question needs to know about the workout as loaded. */
type LoadedRow = SeriesMember & {
  scheduled_time: string | null;
  template_id: string | null;
  notes: string | null;
  with_trainer: boolean;
};

/** The pending question: which action it's about, and how many workouts
 * "this and all following" would cover (this one included). */
type ScopeAsk =
  | { action: "save"; payload: SchedulePayload; patch: SeriesPatch; count: number }
  | { action: "delete"; count: number };

export default function EditScheduleScreen() {
  return (
    <RoleGate role="trainer">
      <EditScheduleScreenBody />
    </RoleGate>
  );
}

function EditScheduleScreenBody() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const trainerId = session!.user.id;

  const [ask, setAsk] = useState<ScopeAsk | null>(null);
  const [checking, setChecking] = useState(false);

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

  const workout = useQuery({
    queryKey: qk.scheduledTrainer.one(id),
    queryFn: async (): Promise<{ initial: ScheduleFormInitial; row: LoadedRow }> => {
      const { data, error } = await supabase
        .from("scheduled_workouts")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return {
        initial: {
          client: data.client_id
            ? { kind: "app", refId: data.client_id }
            : { kind: "managed", refId: data.managed_client_id! },
          templateId: data.template_id,
          date: data.scheduled_date,
          time: data.scheduled_time ? data.scheduled_time.slice(0, 5) : null, // "HH:MM:SS" -> "HH:MM"
          note: data.notes,
          withTrainer: data.with_trainer,
        },
        row: {
          id: data.id,
          series_id: data.series_id,
          status: data.status,
          scheduled_date: data.scheduled_date,
          scheduled_time: data.scheduled_time,
          template_id: data.template_id,
          notes: data.notes,
          with_trainer: data.with_trainer,
        },
      };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ payload, seriesPatch }: { payload: SchedulePayload; seriesPatch: SeriesPatch | null }) => {
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
          with_trainer: payload.withTrainer,
        })
        .eq("id", id);
      if (error) throw error;

      if (seriesPatch && workout.data) await applyToSeries(supabase, workout.data.row, seriesPatch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
      queryClient.invalidateQueries({ queryKey: qk.roster.all });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (scope: "one" | "future") => {
      if (scope === "future" && workout.data) {
        await deleteFromSeries(supabase, workout.data.row);
        return;
      }
      const { error } = await supabase.from("scheduled_workouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.all });
      router.back();
    },
  });

  // How many later workouts of the series a scope question would cover.
  // Asked at tap time, so it's never stale. If the lookup fails, act on this
  // workout only — the same as before series existed.
  async function siblingCount(row: LoadedRow): Promise<number> {
    if (!canActOnSeries(row)) return 0;
    setChecking(true);
    try {
      return (await futureSiblings(supabase, row)).length;
    } catch {
      return 0;
    } finally {
      setChecking(false);
    }
  }

  async function submit(payload: SchedulePayload) {
    const row = workout.data!.row;
    const patch = changedSeriesFields(row, {
      scheduled_time: payload.time,
      template_id: payload.templateId,
      notes: payload.note,
      with_trainer: payload.withTrainer,
    });
    const siblings = Object.keys(patch).length > 0 ? await siblingCount(row) : 0;
    if (siblings > 0) setAsk({ action: "save", payload, patch, count: siblings + 1 });
    else updateMutation.mutate({ payload, seriesPatch: null });
  }

  async function confirmDelete() {
    const siblings = await siblingCount(workout.data!.row);
    if (siblings > 0) {
      setAsk({ action: "delete", count: siblings + 1 });
      return;
    }
    Alert.alert(t("schedule.detail.deleteWorkout"), t("schedule.detail.deleteWorkoutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("schedule.detail.delete"), style: "destructive", onPress: () => deleteMutation.mutate("one") },
    ]);
  }

  function choose(scope: "one" | "future") {
    const current = ask;
    setAsk(null);
    if (!current) return;
    if (current.action === "delete") deleteMutation.mutate(scope);
    else updateMutation.mutate({ payload: current.payload, seriesPatch: scope === "future" ? current.patch : null });
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
          {workout.error ? (workout.error as Error).message : t("schedule.detail.workoutNotFound")}
        </Text>
      </View>
    );
  }

  const mutationError = updateMutation.error ?? deleteMutation.error;

  return (
    <>
      <ScheduleForm
        roster={roster.data ?? []}
        templates={templates.data ?? []}
        loadingRoster={false}
        loadingTemplates={false}
        initial={workout.data.initial}
        submitLabel={t("schedule.detail.saveChanges")}
        submitting={updateMutation.isPending || checking}
        errorMessage={mutationError ? (mutationError as Error).message : null}
        onSubmit={submit}
        footer={
          <Pressable
            className="items-center rounded-xl border border-red-300 px-4 py-3 active:opacity-70"
            disabled={deleteMutation.isPending || checking}
            onPress={confirmDelete}
          >
            <Text className="text-base font-semibold text-red-600">{t("schedule.detail.deleteWorkout")}</Text>
          </Pressable>
        }
      />

      <Sheet
        visible={ask != null}
        onClose={() => setAsk(null)}
        closeLabel={t("common.cancel")}
        title={ask?.action === "delete" ? t("schedule.series.deleteTitle") : t("schedule.series.editTitle")}
      >
        <View style={{ gap: 10 }}>
          <AppText size={14} tone="graphite">
            {t("schedule.series.hint")}
          </AppText>
          <Button label={t("schedule.series.onlyThis")} variant="secondary" block onPress={() => choose("one")} />
          <Button
            label={t("schedule.series.thisAndFuture", { n: ask?.count ?? 0 })}
            variant={ask?.action === "delete" ? "danger" : "primary"}
            block
            onPress={() => choose("future")}
          />
        </View>
      </Sheet>
    </>
  );
}

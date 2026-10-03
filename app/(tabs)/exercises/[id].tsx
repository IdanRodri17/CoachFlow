// app/(tabs)/exercises/[id].tsx — view one exercise.
//
// Trainer: the edit form (pre-filled; its own video preview block) + delete.
// Client: read-only. RLS already prevents a client from editing, but we also
// hide the controls so the UI matches their permissions.
//
// D28c: the client view rebuilt to docs/design/screens/client-exercise.html —
// a dark video poster with a volt play button (tap → the real player), the
// name and chips, the trainer's cues as a numbered list, and "ההיסטוריה שלך":
// the client's last three sessions of this exercise from set_logs, the PR
// marked. History is read for the signed-in client explicitly.

import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideProps } from "lucide-react-native";
import Play from "lucide-react-native/icons/play";
import Repeat from "lucide-react-native/icons/repeat";
import Trophy from "lucide-react-native/icons/trophy";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toDateString } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { parseVideoUrl } from "@/lib/video";
import { formatWeight } from "@/lib/workoutSession";
import { ExerciseForm, type ExerciseInput } from "@/components/ExerciseForm";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import { shortDate } from "@/components/home/format";
import { AppText, Button, Card, Chip, colors, Display, Divider, Icon, Num } from "@/components/ui";

export default function ExerciseDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const isTrainer = profile?.role === "trainer";
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: exercise, isLoading, error } = useQuery({
    queryKey: qk.exercises.one(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").eq("id", id).single();
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
      queryClient.invalidateQueries({ queryKey: qk.exercises.all });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("exercises").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.exercises.all });
      router.back();
    },
  });

  function confirmDelete() {
    Alert.alert(t("exercises.detail.deleteTitle"), t("exercises.detail.deleteMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("exercises.detail.delete"), style: "destructive", onPress: () => deleteMutation.mutate() },
    ]);
  }

  if (isLoading) return <View style={{ flex: 1, backgroundColor: colors.chalk }} />;

  if (error || !exercise) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.chalk, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <AppText size={14} tone="ember" center>
          {error ? (error as Error).message : t("exercises.detail.notFound")}
        </AppText>
      </View>
    );
  }

  if (isTrainer) {
    return (
      <ExerciseForm
        initial={exercise}
        submitLabel={t("exercises.detail.saveChanges")}
        submitting={updateMutation.isPending}
        errorMessage={updateMutation.error ? (updateMutation.error as Error).message : null}
        onSubmit={(input) => updateMutation.mutate(input)}
        footer={
          <Button
            label={t("exercises.detail.deleteExercise")}
            variant="danger"
            size={52}
            block
            disabled={deleteMutation.isPending}
            onPress={confirmDelete}
          />
        }
      />
    );
  }

  return <ClientExercise exercise={exercise} />;
}

type Exercise = {
  id: string;
  name: string;
  description: string | null;
  muscle_group: string | null;
  video_url: string | null;
  default_sets: number | null;
  default_reps: number | null;
};

function ClientExercise({ exercise }: { exercise: Exercise }) {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const [playing, setPlaying] = useState(false);
  const video = exercise.video_url ? parseVideoUrl(exercise.video_url) : null;
  const clientId = session?.user.id ?? "";

  // The client's own past sets of this exercise, newest session first.
  const history = useQuery({
    queryKey: qk.exercises.history(exercise.id, clientId),
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("set_logs")
        .select("weight, reps, is_pr, set_index, workout_log_id, workout_logs!inner(completed_at, client_id)")
        .eq("exercise_id", exercise.id)
        .eq("workout_logs.client_id", clientId);
      if (error) throw error;
      const byLog = new Map<string, { completedAt: string; sets: { weight: number | null; reps: number | null; isPr: boolean; idx: number }[] }>();
      data.forEach((row) => {
        const log = row.workout_logs as unknown as { completed_at: string };
        const entry = byLog.get(row.workout_log_id) ?? { completedAt: log.completed_at, sets: [] };
        entry.sets.push({ weight: row.weight, reps: row.reps, isPr: row.is_pr, idx: row.set_index });
        byLog.set(row.workout_log_id, entry);
      });
      return [...byLog.values()]
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        .slice(0, 3)
        .map((e) => ({ ...e, sets: e.sets.sort((a, b) => a.idx - b.idx) }));
    },
  });

  // One cue per line (or per sentence when it's a single paragraph).
  const cues = (exercise.description ?? "")
    .split(/\n+/)
    .flatMap((line) => line.split(/\.\s+/).map((c, i, all) => (i < all.length - 1 ? `${c}.` : c)))
    .map((c) => c.trim())
    .filter(Boolean);

  const scheme =
    exercise.default_sets != null || exercise.default_reps != null
      ? `${exercise.default_sets ?? "—"} × ${exercise.default_reps ?? "—"}`
      : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 30, gap: 18 }}
    >
      {video ? (
        playing ? (
          <ExerciseVideo url={exercise.video_url} />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("exercises.view.play")}
            onPress={() => setPlaying(true)}
            style={({ pressed }) => ({
              height: 197,
              borderRadius: 20,
              backgroundColor: colors.ink,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              style={{
                width: 68,
                height: 68,
                borderRadius: 34,
                backgroundColor: colors.volt,
                alignItems: "center",
                justifyContent: "center",
                paddingStart: 4,
              }}
            >
              <Icon icon={FilledPlay} size={30} color={colors.ink} />
            </View>
            <AppText size={13} tone="ash" style={{ position: "absolute", bottom: 12, start: 14 }}>
              {t("exercises.view.video", { source: video.provider === "youtube" ? "YouTube" : "Vimeo" })}
            </AppText>
          </Pressable>
        )
      ) : null}

      <View style={{ gap: 10 }}>
        <Display size={42}>{exercise.name}</Display>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {exercise.muscle_group ? <Chip kind="neutral" label={exercise.muscle_group} /> : null}
          {scheme ? <Chip kind="neutral" icon={Repeat} label={ltr(scheme)} /> : null}
        </View>
      </View>

      {cues.length > 0 ? (
        <Card style={{ padding: 12, gap: 16 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("exercises.view.cues")}
          </AppText>
          <View style={{ gap: 10 }}>
            {cues.map((cue, i) => (
              <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.mist,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Num size={16} center>
                    {i + 1}
                  </Num>
                </View>
                <AppText size={16} lineHeight={24} style={{ flex: 1, paddingTop: 2 }}>
                  {cue}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AppText size={18} weight="semibold" lineHeight={23}>
            {t("exercises.view.history")}
          </AppText>
          <AppText size={13} tone="graphite">
            {t("exercises.view.historyUnit")}
          </AppText>
        </View>
        {history.data && history.data.length > 0 ? (
          history.data.map((s, i) => (
            <View key={s.completedAt}>
              {i > 0 ? <Divider inset={0} /> : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 6 }}>
                <AppText size={14} weight="semibold" tone="graphite" style={{ width: 44 }}>
                  {shortDate(toDateString(new Date(s.completedAt)), i18n.language)}
                </AppText>
                <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 6 }}>
                  {s.sets.map((set, k) => (
                    <Num key={k} size={18} weight="semibold">
                      {set.weight != null ? `${formatWeight(set.weight)}×${set.reps ?? "—"}` : `${set.reps ?? "—"}`}
                    </Num>
                  ))}
                </View>
                {s.sets.some((set) => set.isPr) ? <Chip kind="pr" label={t("exercises.view.pr")} icon={Trophy} /> : null}
              </View>
            </View>
          ))
        ) : history.isSuccess ? (
          <AppText size={14} tone="graphite">
            {t("exercises.view.noHistory")}
          </AppText>
        ) : null}
      </Card>
    </ScrollView>
  );
}

/** The play mark is a filled triangle in the reference. */
function FilledPlay(props: LucideProps) {
  return <Play {...props} fill={props.color} />;
}

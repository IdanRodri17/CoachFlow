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
import { Alert, ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideProps } from "lucide-react-native";
import Play from "lucide-react-native/icons/play";
import Repeat from "lucide-react-native/icons/repeat";
import Trophy from "lucide-react-native/icons/trophy";

import { qk } from "@/lib/queryKeys";
import { friendlyError, screenError } from "@/lib/friendlyError";
import { ScreenLoading, ScreenMessage } from "@/components/ui/ScreenState";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toDateString } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { parseVideoUrl } from "@/lib/video";
import { trainerFirstName, useMyTrainer } from "@/lib/useMyTrainer";
import { formatWeight } from "@/lib/workoutSession";
import { subjectSets } from "@/lib/useWorkoutSession";
import { ExerciseForm, type ExerciseInput } from "@/components/ExerciseForm";
import { ExerciseVideo } from "@/components/ExerciseVideo";
import { shortDate } from "@/components/home/format";
import { AppText, Button, Card, Chip, colors, Display, Divider, Icon, Num, Pressable } from "@/components/ui";

export default function ExerciseDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const isTrainer = profile?.role === "trainer";
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: exercise, isLoading, error, refetch } = useQuery({
    queryKey: qk.exercises.one(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const updateMutation = useMutation({
    meta: { inlineError: true },
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
    meta: { inlineError: true },
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

  // 0033: an exercise someone has trained can't be deleted — its sets and PRs
  // would go with it. The database refuses with 'exercise_in_use'.
  const deleteError = deleteMutation.error as Error | null;
  const formError = deleteError
    ? deleteError.message.includes("exercise_in_use")
      ? t("exercises.detail.inUse")
      : friendlyError(deleteError, t)
    : updateMutation.error
      ? friendlyError(updateMutation.error, t)
      : null;

  if (isLoading) return <ScreenLoading />;

  if (error || !exercise) {
    const s = screenError(error, t, t("exercises.detail.notFound"));
    return <ScreenMessage message={s.message} onRetry={s.canRetry ? () => void refetch() : undefined} />;
  }

  if (isTrainer) {
    return (
      <ExerciseForm
        initial={exercise}
        submitLabel={t("exercises.detail.saveChanges")}
        submitting={updateMutation.isPending}
        errorMessage={formError}
        onSubmit={(input) => {
          deleteMutation.reset();
          updateMutation.mutate(input);
        }}
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
  const trainerName = trainerFirstName(useMyTrainer().data);
  const video = exercise.video_url ? parseVideoUrl(exercise.video_url) : null;
  const clientId = session?.user.id ?? "";

  // The client's own past sets of this exercise, newest session first.
  // Paged (subjectSets): one request stops at the API's 1,000-row cap, in no
  // particular order, and the newest sessions could be the ones cut.
  const history = useQuery({
    queryKey: qk.exercises.history(exercise.id, clientId),
    enabled: !!clientId,
    queryFn: async () => {
      const sets = await subjectSets([exercise.id], { kind: "app", id: clientId });
      const byLog = new Map<string, { completedAt: string; sets: { weight: number | null; reps: number | null; isPr: boolean; idx: number }[] }>();
      sets.forEach((s) => {
        const entry = byLog.get(s.logId) ?? { completedAt: s.completedAt, sets: [] };
        entry.sets.push({ weight: s.weight, reps: s.reps, isPr: s.isPr, idx: s.setIndex });
        byLog.set(s.logId, entry);
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
          <ExerciseVideo url={exercise.video_url} autoPlay />
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
            {trainerName ? t("exercises.view.cuesFrom", { name: trainerName }) : t("exercises.view.cues")}
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

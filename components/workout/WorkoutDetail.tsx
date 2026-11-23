// components/workout/WorkoutDetail.tsx — the read-only workout pages, in the
// kit's light look (they used to be the last pre-redesign screen, U2).
//
// WorkoutPreview (2026-11-21, Idan): a workout opens only on its day, but
// trainer and client can look ahead — what's coming, set by set, with the
// recommended weight (the same prefill() rule the open workout uses: the
// higher of last time and the template's target). A trainer previewing an
// app client's open workout is told the client logs it themselves.
//
// CompletedWorkout: what "previous workouts" opens — the duration, effort,
// both notes, every exercise's sets with PRs, and the skips and swaps.

import type { ReactNode } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Clock from "lucide-react-native/icons/clock";
import MessageSquare from "lucide-react-native/icons/message-square";
import Repeat from "lucide-react-native/icons/repeat";
import SkipForward from "lucide-react-native/icons/skip-forward";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { toDateString } from "@/lib/dates";
import { ltr } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendlyError";
import type { WorkoutData, WorkoutMode } from "@/lib/useWorkoutSession";
import { formatWeight, prefill } from "@/lib/workoutSession";
import { longDate, shortDate } from "@/components/home/format";
import {
  AppText,
  Card,
  Chip,
  colors,
  Display,
  Icon,
  IconButton,
  ListCard,
  Num,
  SectionHeader,
  type IconComponent,
} from "@/components/ui";
import { InlineError } from "@/components/ui/ScreenState";

/** These pages draw their own top bar, like the group and share screens: the
 * stack header is hidden. Recent iOS draws that header see-through over the
 * page, and letting iOS inset the page left it opening half-scrolled, the
 * title still under the header (Idan's video, 2026-11-23). */
function Page({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.chalk }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: Math.max(insets.bottom, 16) + 16,
        gap: 16,
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <View style={{ height: 52, flexDirection: "row", alignItems: "center" }}>
        <IconButton
          icon={ChevronLeft}
          mirror
          iconSize={22}
          accessibilityLabel={t("common.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        />
      </View>
      <View style={{ gap: 6 }}>
        <Display size={38} numberOfLines={2}>
          {title}
        </Display>
        <AppText size={15} tone="graphite">
          {subtitle}
        </AppText>
      </View>
      {children}
    </ScrollView>
  );
}

/** A tinted card with an icon: the page's one-line status. */
function StatusCard({
  icon,
  tint,
  ink,
  children,
}: {
  icon: IconComponent;
  tint: string;
  ink: string;
  children: ReactNode;
}) {
  return (
    <Card style={{ padding: 14, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: tint }}>
        <Icon icon={icon} size={20} color={ink} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>{children}</View>
    </Card>
  );
}

/** The trainer's note on the session: "from your trainer" to the client. */
function SessionNote({ note, mode }: { note: string; mode: WorkoutMode }) {
  const { t } = useTranslation();
  return (
    <Card style={{ padding: 14, gap: 4 }}>
      <AppText size={13} weight="semibold" tone="gold">
        {mode === "client" ? t("workout.noteFromTrainer") : t("sessionForm.note")}
      </AppText>
      <AppText size={15}>{note}</AppText>
    </Card>
  );
}

function kg(w: number, unit: string): string {
  return ltr(`${formatWeight(w)} ${unit}`);
}

// ---------------------------------------------------------------------------
// Preview (an open workout before its day, or an app client's, for the trainer)
// ---------------------------------------------------------------------------

export function WorkoutPreview({
  data,
  mode,
  reason,
  subjectName,
}: {
  data: WorkoutData;
  mode: WorkoutMode;
  reason: "notYet" | "clientLogs";
  /** Trainer mode: whose workout it is. */
  subjectName: string | null;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const day = longDate(data.scheduledDate, lang);
  const unit = t("progress.kg");

  return (
    <Page
      title={data.title ?? t("workout.freeWorkout")}
      subtitle={[subjectName, day].filter(Boolean).join(" · ")}
    >
      <StatusCard icon={Clock} tint={colors.skySoft} ink={colors.sky}>
        <AppText size={15} weight="semibold">
          {reason === "notYet" ? t("workout.preview.startsOn", { date: day }) : t("workout.trainerMode.appClientLogsOwn")}
        </AppText>
      </StatusCard>

      {data.note ? <SessionNote note={data.note} mode={mode} /> : null}

      <View style={{ gap: 10 }}>
        <SectionHeader title={t("workout.preview.exercisesTitle")} />
        {data.exercises.length === 0 ? (
          <AppText size={15} tone="graphite">
            {t("workout.preview.noExercises")}
          </AppText>
        ) : (
          <>
            <ListCard>
              {data.exercises.map((e, i) => {
                const p = prefill(e);
                return (
                  <View
                    key={`${e.exerciseId}-${i}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <AppText size={16} weight="semibold" numberOfLines={2}>
                        {e.name}
                      </AppText>
                      {e.lastSession && e.lastSession.sets.length > 0 ? (
                        <AppText size={13} tone="graphite">
                          {t("workout.overview.lastTime", {
                            date: ltr(shortDate(toDateString(new Date(e.lastSession.completedAt)), lang)),
                            sets: e.lastSession.sets
                              .map((x) => ltr(x.weight != null ? `${formatWeight(x.weight)}×${x.reps ?? "—"}` : `${x.reps ?? "—"}`))
                              .join(" · "),
                          })}
                        </AppText>
                      ) : e.last && e.last.weight != null ? (
                        <AppText size={13} tone="graphite">
                          {t("workout.preview.lastTime", { weight: kg(e.last.weight, unit), reps: ltr(String(e.last.reps)) })}
                        </AppText>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Num size={19} weight="semibold">
                        {ltr(`${e.sets} × ${p.reps}`)}
                      </Num>
                      <AppText size={13} weight="medium" tone={p.weight != null ? "ink" : "graphite"}>
                        {p.weight != null ? kg(p.weight, unit) : t("workout.preview.bodyweight")}
                      </AppText>
                    </View>
                  </View>
                );
              })}
            </ListCard>
            <AppText size={13} tone="smoke">
              {t("workout.preview.recommendedHint")}
            </AppText>
          </>
        )}
      </View>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Completed (read-only summary)
// ---------------------------------------------------------------------------

type LoggedSet = { set_index: number; reps: number | null; weight: number | null; is_pr: boolean };
type LoggedGroup = { exerciseId: string; name: string; sets: LoggedSet[] };
type Adj = { action: "skipped" | "swapped"; exerciseName: string; swapName: string | null; reason: string | null };

export function CompletedWorkout({
  data,
  mode,
  subjectName,
}: {
  data: WorkoutData;
  mode: WorkoutMode;
  subjectName: string | null;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const scheduledId = data.scheduledId;
  const unit = t("progress.kg");

  const query = useQuery({
    queryKey: qk.workout.summary(scheduledId),
    queryFn: async () => {
      const { data: log, error } = await supabase
        .from("workout_logs")
        .select("*")
        .eq("scheduled_workout_id", scheduledId)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!log) return { log: null, groups: [] as LoggedGroup[], adjustments: [] as Adj[] };

      const [setsRes, adjRes] = await Promise.all([
        supabase.from("set_logs").select("*").eq("workout_log_id", log.id).order("set_index"),
        supabase.from("exercise_adjustments").select("*").eq("workout_log_id", log.id),
      ]);
      if (setsRes.error) throw setsRes.error;
      if (adjRes.error) throw adjRes.error;
      const sets = setsRes.data ?? [];
      const adjustmentsRaw = adjRes.data ?? [];

      // Names for every exercise referenced (sets + adjustments).
      const exIds = [
        ...new Set([
          ...sets.map((s) => s.exercise_id),
          ...adjustmentsRaw.map((a) => a.exercise_id),
          ...(adjustmentsRaw.map((a) => a.swapped_for_exercise_id).filter(Boolean) as string[]),
        ]),
      ];
      const nameMap = new Map<string, string>();
      if (exIds.length > 0) {
        const { data: exs } = await supabase.from("exercises").select("id, name").in("id", exIds);
        exs?.forEach((e) => nameMap.set(e.id, e.name));
      }

      const order: string[] = [];
      const byEx = new Map<string, LoggedSet[]>();
      for (const s of sets) {
        if (!byEx.has(s.exercise_id)) {
          byEx.set(s.exercise_id, []);
          order.push(s.exercise_id);
        }
        byEx.get(s.exercise_id)!.push({ set_index: s.set_index, reps: s.reps, weight: s.weight, is_pr: s.is_pr });
      }
      const groups: LoggedGroup[] = order.map((exId) => ({
        exerciseId: exId,
        name: nameMap.get(exId) ?? t("workout.exerciseFallback"),
        sets: byEx.get(exId)!,
      }));

      const adjustments: Adj[] = adjustmentsRaw.map((a) => ({
        action: a.action,
        exerciseName: nameMap.get(a.exercise_id) ?? t("workout.exerciseFallback"),
        swapName: a.swapped_for_exercise_id ? nameMap.get(a.swapped_for_exercise_id) ?? t("workout.exerciseFallback") : null,
        reason: a.reason,
      }));

      return { log, groups, adjustments };
    },
  });

  const title = data.title ?? t("workout.freeWorkout");
  const subtitle = [subjectName, longDate(data.scheduledDate, lang)].filter(Boolean).join(" · ");

  if (query.isLoading) {
    return (
      <Page title={title} subtitle={subtitle}>
        <ActivityIndicator color={colors.ink} />
      </Page>
    );
  }
  if (query.error) {
    return (
      <Page title={title} subtitle={subtitle}>
        <InlineError message={friendlyError(query.error, t)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }

  const log = query.data?.log ?? null;
  const groups = query.data?.groups ?? [];
  const adjustments = query.data?.adjustments ?? [];
  const facts = log
    ? [
        // A late log keeps the session's day in the subtitle; this is when it was done.
        toDateString(new Date(log.completed_at)) !== data.scheduledDate
          ? longDate(toDateString(new Date(log.completed_at)), lang)
          : null,
        log.duration_seconds
          ? t("workout.durationMinutes", { count: Math.max(1, Math.round(log.duration_seconds / 60)) })
          : null,
        log.effort_rating != null ? `${t("workout.effortLabel")} ${t("workout.effortValue", { value: log.effort_rating })}` : null,
      ].filter(Boolean)
    : [];

  return (
    <Page title={title} subtitle={subtitle}>
      <StatusCard icon={Check} tint={colors.voltSoft} ink={colors.voltInk}>
        <AppText size={15} weight="semibold">
          {t("workout.completedTitle")}
        </AppText>
        {facts.length > 0 ? (
          <AppText size={13} tone="graphite">
            {facts.join(" · ")}
          </AppText>
        ) : null}
      </StatusCard>

      {log?.client_note ? (
        <Card style={{ padding: 14, flexDirection: "row", gap: 10 }}>
          <Icon icon={MessageSquare} size={18} color={colors.graphite} />
          <AppText size={15} tone="graphite" style={{ flex: 1 }}>{`"${log.client_note}"`}</AppText>
        </Card>
      ) : null}

      {data.note ? <SessionNote note={data.note} mode={mode} /> : null}

      {groups.length === 0 && adjustments.length === 0 ? (
        <AppText size={15} tone="graphite">
          {t("workout.noSetsLogged")}
        </AppText>
      ) : null}

      {groups.map((g) => (
        <Card key={g.exerciseId} style={{ padding: 14, gap: 10 }}>
          <AppText size={16} weight="semibold">
            {g.name}
          </AppText>
          {g.sets.map((s, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <AppText size={14} tone="graphite" style={{ width: 56 }}>
                {t("workout.setNumber", { number: s.set_index + 1 })}
              </AppText>
              <Num size={17} weight="semibold" style={{ flex: 1 }}>
                {ltr(
                  [s.reps != null ? `${s.reps}` : "—", s.weight != null ? `${formatWeight(s.weight)} ${unit}` : null]
                    .filter(Boolean)
                    .join(" × "),
                )}
              </Num>
              {s.is_pr ? <Chip kind="pr" label={t("workout.prBadge")} /> : null}
            </View>
          ))}
        </Card>
      ))}

      {adjustments.map((a, i) => (
        <Card key={i} style={{ padding: 14, flexDirection: "row", gap: 10, backgroundColor: colors.mist }}>
          <Icon icon={a.action === "skipped" ? SkipForward : Repeat} size={18} color={colors.graphite} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <AppText size={14} weight="semibold">
              {a.action === "skipped"
                ? t("workout.skippedExercise", { name: a.exerciseName })
                : t("workout.swappedExercise", { from: a.exerciseName, to: a.swapName })}
            </AppText>
            {a.reason ? <AppText size={14} tone="graphite">{`"${a.reason}"`}</AppText> : null}
          </View>
        </Card>
      ))}
    </Page>
  );
}

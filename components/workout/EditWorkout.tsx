// components/workout/EditWorkout.tsx — fixing a finished workout (Idan,
// 2026-11-27: "edit it in place").
//
// The summary's exercises and sets, in the same light look. Tapping a set
// opens a small sheet (reps and weight steppers, delete); each exercise has
// "add a set" (it repeats the last one), and "add an exercise" picks from the
// library (it starts from last time's numbers). Then the effort and the note.
// One save: lib/useWorkoutSession.ts saveWorkoutEdit (rpc edit_workout_log,
// 0046), which replays the PRs of the exercises involved (lib/workoutEdit.ts).
// The package, the money and the streak don't move: the session stays done.

import { useMemo, useState } from "react";
import { Alert, ActivityIndicator, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import Pencil from "lucide-react-native/icons/pencil";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";
import Trash from "lucide-react-native/icons/trash";
import X from "lucide-react-native/icons/x";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { ltr } from "@/lib/i18n";
import { friendlyError } from "@/lib/friendlyError";
import { saveWorkoutEdit, subjectHistory, type WorkoutSubject } from "@/lib/useWorkoutSession";
import {
  addExercise,
  addSet,
  clampReps,
  clampWeight,
  isUnchanged,
  removeSet,
  updateSet,
  type EditGroup,
  type EditSet,
} from "@/lib/workoutEdit";
import { DEFAULT_REPS, formatWeight, stepWeight } from "@/lib/workoutSession";
import {
  AppText,
  Button,
  Card,
  colors,
  Display,
  FieldLabel,
  Icon,
  IconButton,
  Input,
  Num,
  Pressable,
  SectionHeader,
  Sheet,
  Stepper,
  TextButton,
} from "@/components/ui";

export type EditableLog = {
  id: string;
  completedAt: string;
  effort: number | null;
  note: string | null;
};

export function EditWorkout({
  title,
  subtitle,
  log,
  initialGroups,
  subject,
  summaryKey,
  onDone,
}: {
  title: string;
  subtitle: string;
  log: EditableLog;
  initialGroups: EditGroup[];
  subject: WorkoutSubject;
  /** The summary's query key, refreshed after the save. */
  summaryKey: readonly unknown[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const unit = t("progress.kg");

  const [groups, setGroups] = useState<EditGroup[]>(initialGroups);
  const [effort, setEffort] = useState<number | null>(log.effort);
  const [note, setNote] = useState(log.note ?? "");
  const [editing, setEditing] = useState<{ g: number; i: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  const cleanNote = note.trim() === "" ? null : note.trim();
  const dirty = !isUnchanged(initialGroups, groups) || effort !== log.effort || cleanNote !== (log.note ?? null);

  // The same list the workout's picker uses (and its cache entry).
  const library = useQuery({
    queryKey: qk.exercises.list,
    enabled: picking,
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = library.data ?? [];
    return q ? rows.filter((e) => e.name.toLowerCase().includes(q)) : rows;
  }, [library.data, query]);

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      saveWorkoutEdit({
        logId: log.id,
        completedAt: log.completedAt,
        subject,
        exercisesBefore: initialGroups.map((g) => g.exerciseId),
        groups,
        effort,
        note: cleanNote,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: summaryKey });
      // Everything that shows these sets, their PRs or this session's effort.
      queryClient.invalidateQueries({ queryKey: qk.exercises.all });
      queryClient.invalidateQueries({ queryKey: qk.progress.all });
      queryClient.invalidateQueries({ queryKey: qk.clientContext.all });
      queryClient.invalidateQueries({ queryKey: qk.clientDetail.all });
      queryClient.invalidateQueries({ queryKey: qk.scheduledTrainer.attention });
      queryClient.invalidateQueries({ queryKey: qk.shareCard.all });
      queryClient.invalidateQueries({ queryKey: qk.scheduledClient.previous });
      onDone();
    },
  });

  function cancel() {
    if (!dirty) {
      onDone();
      return;
    }
    Alert.alert(t("workout.edit.discardTitle"), undefined, [
      { text: t("workout.edit.keepEditing"), style: "cancel" },
      { text: t("workout.edit.discard"), style: "destructive", onPress: onDone },
    ]);
  }

  // A picked exercise starts from the subject's last set of it, then opens
  // its set so the numbers can be checked.
  async function pick(ex: { id: string; name: string; default_reps: number | null }) {
    if (addingId) return;
    setAddingId(ex.id);
    let first: EditSet = { weight: null, reps: ex.default_reps ?? DEFAULT_REPS };
    try {
      const [last] = await subjectHistory([ex.id], subject);
      if (last) first = { weight: last.weight, reps: last.reps ?? first.reps };
    } catch {
      // No history (offline): the library's default reps.
    }
    const at = groups.findIndex((g) => g.exerciseId === ex.id);
    const next = addExercise(groups, ex, first);
    setGroups(next);
    setAddingId(null);
    setPicking(false);
    setQuery("");
    const g = at >= 0 ? at : next.length - 1;
    setEditing({ g, i: next[g].sets.length - 1 });
  }

  const current = editing ? groups[editing.g]?.sets[editing.i] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.chalk }}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 16) + 16,
          gap: 16,
        }}
      >
        <View style={{ height: 52, flexDirection: "row", alignItems: "center" }}>
          <IconButton icon={X} iconSize={22} accessibilityLabel={t("workout.edit.cancel")} onPress={cancel} />
        </View>
        <View style={{ gap: 6 }}>
          <Display size={38} numberOfLines={2}>
            {t("workout.edit.title")}
          </Display>
          <AppText size={15} tone="graphite">
            {[title, subtitle].filter(Boolean).join(" · ")}
          </AppText>
          <AppText size={14} tone="smoke">
            {t("workout.edit.hint")}
          </AppText>
        </View>

        {groups.map((g, gi) => (
          <Card key={g.exerciseId} style={{ padding: 14, gap: 6 }}>
            <AppText size={16} weight="semibold">
              {g.name}
            </AppText>
            {g.sets.length === 0 ? (
              <AppText size={14} tone="smoke">
                {t("workout.edit.noSets")}
              </AppText>
            ) : null}
            {g.sets.map((s, i) => (
              <Pressable
                key={i}
                accessibilityRole="button"
                accessibilityLabel={t("workout.edit.editSet", { number: i + 1 })}
                onPress={() => setEditing({ g: gi, i })}
                style={({ pressed }) => ({
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  marginHorizontal: -8,
                  backgroundColor: pressed ? colors.mist : "transparent",
                })}
              >
                <AppText size={14} tone="graphite" style={{ width: 56 }}>
                  {t("workout.setNumber", { number: i + 1 })}
                </AppText>
                <Num size={17} weight="semibold" style={{ flex: 1 }}>
                  {ltr([`${s.reps}`, s.weight != null ? `${formatWeight(s.weight)} ${unit}` : null].filter(Boolean).join(" × "))}
                </Num>
                <Icon icon={Pencil} size={16} color={colors.smoke} />
              </Pressable>
            ))}
            <View style={{ flexDirection: "row" }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setGroups(addSet(groups, gi))}
                style={({ pressed }) => ({
                  height: 40,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Icon icon={Plus} size={18} color={colors.ink} />
                <AppText size={14} weight="semibold">
                  {t("workout.edit.addSet")}
                </AppText>
              </Pressable>
            </View>
          </Card>
        ))}

        <Button
          label={t("workout.edit.addExercise")}
          icon={Plus}
          variant="secondary"
          size={52}
          block
          onPress={() => setPicking(true)}
        />

        {/* Effort 1–10, the finish step's scale; tap again to clear. */}
        <View style={{ gap: 10 }}>
          <SectionHeader title={t("workout.finish.effortTitle")} />
          <View accessibilityRole="radiogroup" accessibilityLabel={t("workout.finish.effortLabel")} style={{ gap: 8 }}>
            {[0, 5].map((rowStart) => (
              <View key={rowStart} style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((k) => {
                  const n = rowStart + k;
                  const on = effort === n;
                  return (
                    <Pressable
                      key={n}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      onPress={() => setEffort(on ? null : n)}
                      style={({ pressed }) => ({
                        flex: 1,
                        height: 48,
                        borderRadius: 14,
                        borderWidth: on ? 0 : 1,
                        borderColor: colors.lineStrong,
                        backgroundColor: on ? colors.ink : colors.paper,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Num size={20} tone={on ? "white" : "ink"} center>
                        {n}
                      </Num>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>{t("workout.edit.note")}</FieldLabel>
          <Input
            size="md"
            multiline
            value={note}
            onChangeText={setNote}
            placeholder={t("workout.finish.freePlaceholder")}
            containerStyle={{ minHeight: 88 }}
          />
        </View>

        {save.error ? (
          <AppText size={14} tone="ember" center>
            {friendlyError(save.error, t)}
          </AppText>
        ) : null}

        <View style={{ gap: 4 }}>
          <Button
            label={t("workout.edit.save")}
            icon={Check}
            variant="primary"
            size={56}
            block
            disabled={!dirty}
            loading={save.isPending}
            onPress={() => save.mutate()}
          />
          <TextButton label={t("workout.edit.cancel")} onPress={cancel} style={{ alignSelf: "center" }} />
        </View>
      </ScrollView>

      {/* One set: reps and weight, or delete it. */}
      <Sheet
        visible={editing != null && current != null}
        onClose={() => setEditing(null)}
        closeLabel={t("workout.edit.done")}
        title={
          editing && groups[editing.g]
            ? `${groups[editing.g].name} · ${t("workout.setNumber", { number: editing.i + 1 })}`
            : undefined
        }
      >
        {editing && current ? (
          <View style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <FieldLabel>{t("workout.edit.reps")}</FieldLabel>
              <Stepper
                value={current.reps}
                decrementLabel={t("workout.mode.repsDown")}
                incrementLabel={t("workout.mode.repsUp")}
                onDecrement={() => setGroups(updateSet(groups, editing.g, editing.i, { reps: clampReps(current.reps - 1) }))}
                onIncrement={() => setGroups(updateSet(groups, editing.g, editing.i, { reps: clampReps(current.reps + 1) }))}
                onSet={(v) => setGroups(updateSet(groups, editing.g, editing.i, { reps: clampReps(v) }))}
                typeHint={t("workout.mode.tapToType")}
              />
            </View>
            <View style={{ gap: 6 }}>
              <FieldLabel>{t("workout.edit.weight")}</FieldLabel>
              <Stepper
                value={current.weight != null ? formatWeight(current.weight) : "—"}
                unit={current.weight != null ? unit : undefined}
                decrementLabel={t("workout.mode.weightDown")}
                incrementLabel={t("workout.mode.weightUp")}
                // Below 0 kg is bodyweight (no weight), as the workout logs it.
                onDecrement={() =>
                  setGroups(
                    updateSet(groups, editing.g, editing.i, {
                      weight: current.weight == null || current.weight <= 0 ? null : stepWeight(current.weight, -1),
                    }),
                  )
                }
                onIncrement={() =>
                  setGroups(updateSet(groups, editing.g, editing.i, { weight: stepWeight(current.weight ?? 0, 1) }))
                }
                onSet={(v) => setGroups(updateSet(groups, editing.g, editing.i, { weight: clampWeight(v) }))}
                decimal
                typeHint={t("workout.mode.tapToType")}
              />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button
                label={t("workout.edit.deleteSet")}
                icon={Trash}
                variant="danger"
                size={52}
                style={{ flex: 1 }}
                onPress={() => {
                  setGroups(removeSet(groups, editing.g, editing.i));
                  setEditing(null);
                }}
              />
              <Button
                label={t("workout.edit.done")}
                variant="primary"
                size={52}
                style={{ flex: 1 }}
                onPress={() => setEditing(null)}
              />
            </View>
          </View>
        ) : null}
      </Sheet>

      {/* Add an exercise from the library. */}
      <Sheet
        visible={picking}
        onClose={() => setPicking(false)}
        closeLabel={t("workout.edit.done")}
        title={t("workout.edit.addExercise")}
      >
        <View style={{ gap: 12 }}>
          <Input
            size="md"
            leadingIcon={Search}
            value={query}
            onChangeText={setQuery}
            placeholder={t("workout.pick.search")}
            returnKeyType="search"
            accessibilityLabel={t("workout.pick.search")}
          />
          {library.isLoading ? (
            <ActivityIndicator color={colors.ink} />
          ) : shown.length === 0 ? (
            <AppText size={14} tone="graphite">
              {t("workout.pick.empty")}
            </AppText>
          ) : (
            <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
              {shown.map((e, i) => (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  accessibilityLabel={e.name}
                  disabled={addingId != null}
                  onPress={() => void pick(e)}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    paddingVertical: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.line,
                    opacity: pressed || (addingId != null && addingId !== e.id) ? 0.6 : 1,
                  })}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <AppText size={16} weight="semibold" numberOfLines={1}>
                      {e.name}
                    </AppText>
                    {e.muscle_group ? (
                      <AppText size={13} tone="graphite" numberOfLines={1}>
                        {t(`exercises.muscles.${e.muscle_group}`, { defaultValue: e.muscle_group })}
                      </AppText>
                    ) : null}
                  </View>
                  {addingId === e.id ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <Icon icon={Plus} size={20} color={colors.ink} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </Sheet>
    </View>
  );
}

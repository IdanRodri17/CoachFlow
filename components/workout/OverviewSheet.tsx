// components/workout/OverviewSheet.tsx — D20d: the all-exercises sheet behind
// the list icon in the workout top bar (docs/design/screens/workout-overview.html,
// DESIGN.md §6.2 rule 8). Every exercise with its status; tapping an
// unfinished one jumps to it (machine busy → do another and come back; its
// logged sets stay); "סיום האימון עכשיו" goes to the finish step.

import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronsRight from "lucide-react-native/icons/chevrons-right";
import X from "lucide-react-native/icons/x";

import { ltr } from "@/lib/i18n";
import type { WorkoutSession } from "@/lib/useWorkoutSession";
import { formatElapsed, formatWeight, overview, type OverviewRow } from "@/lib/workoutSession";
import { AppText, Button, colors, Icon, IconButton, Num, Sheet } from "@/components/ui";

export function OverviewSheet({
  visible,
  session,
  note,
  onClose,
  onJump,
  onFinish,
}: {
  visible: boolean;
  session: WorkoutSession;
  /** The trainer's note on this workout, if any. */
  note: string | null;
  onClose: () => void;
  onJump: (ex: number) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const { state: s, now } = session;
  const rows = overview(s);
  const done = rows.filter((r) => r.status === "done").length;

  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("workout.overview.close")} dark>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText size={22} weight="semibold" lineHeight={29} tone="bone">
            {t("workout.overview.title")}
          </AppText>
          <AppText size={14} tone="ash">
            {t("workout.overview.progress", { done, total: rows.length, time: ltr(formatElapsed(now - s.startedAt)) })}
          </AppText>
        </View>
        <IconButton icon={X} variant="dark" accessibilityLabel={t("workout.overview.close")} onPress={onClose} />
      </View>

      <AppText size={14} tone="ash" lineHeight={21}>
        {t("workout.overview.hint")}
      </AppText>

      {note ? (
        <View style={{ borderRadius: 16, backgroundColor: colors.iron3, padding: 12, gap: 2 }}>
          <AppText size={13} weight="semibold" tone="volt">
            {t("workout.noteFromTrainer")}
          </AppText>
          <AppText size={15} tone="bone" lineHeight={21}>
            {note}
          </AppText>
        </View>
      ) : null}

      <ScrollView style={{ maxHeight: 420, marginHorizontal: -8 }} contentContainerStyle={{ gap: 2 }}>
        {rows.map((r) => (
          <ExerciseRow key={r.index} row={r} onPress={() => onJump(r.index)} />
        ))}
      </ScrollView>

      <Button label={t("workout.overview.finishNow")} variant="darkOutline" size={52} block onPress={onFinish} />
    </Sheet>
  );
}

function ExerciseRow({ row, onPress }: { row: OverviewRow; onPress: () => void }) {
  const { t } = useTranslation();
  const canJump = row.status === "current" || row.status === "open";
  const startNums =
    row.start.weight != null
      ? `${ltr(`${row.sets} × ${row.start.reps}`)} · ${t("workout.overview.kg", { weight: ltr(formatWeight(row.start.weight)) })}`
      : `${ltr(`${row.sets} × ${row.start.reps}`)} · ${t("workout.mode.bodyweight")}`;

  let sub: string;
  if (row.status === "done") {
    sub = [
      t("workout.overview.setsCount", { count: row.logged }),
      row.pr ? t("workout.overview.newPr") : null,
      row.swapped ? t("workout.overview.swapped") : null,
    ]
      .filter(Boolean)
      .join(" · ");
  } else if (row.status === "skipped") {
    sub = row.reason ? `${t("workout.overview.skipped")} · ${row.reason}` : t("workout.overview.skipped");
  } else if (row.status === "current") {
    sub = t("workout.overview.now", { n: row.logged + 1, total: row.sets });
  } else if (row.logged > 0) {
    sub = t("workout.overview.partial", { done: row.logged, total: row.sets });
  } else {
    sub = startNums;
  }

  const muted = row.status === "done" || row.status === "skipped";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !canJump, selected: row.status === "current" }}
      disabled={!canJump}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 60,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: row.status === "current" ? colors.iron3 : pressed ? "#1C1F22" : "transparent",
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
      })}
    >
      <StatusDot row={row} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size={16} weight="semibold" tone={muted ? "ash" : "bone"} numberOfLines={1}>
          {row.name}
        </AppText>
        <AppText size={13} tone={row.status === "current" ? "volt" : muted ? "ash2" : "ash"} numberOfLines={1}>
          {sub}
        </AppText>
      </View>
      {row.status === "open" ? <Icon icon={ChevronRight} size={18} color={colors.ash} mirror /> : null}
    </Pressable>
  );
}

function StatusDot({ row }: { row: OverviewRow }) {
  const base = { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" } as const;
  if (row.status === "done") {
    return (
      <View style={[base, { backgroundColor: colors.volt }]}>
        <Icon icon={Check} size={18} color={colors.ink} strokeWidth={2.6} />
      </View>
    );
  }
  if (row.status === "current") {
    return (
      <View style={[base, { borderWidth: 2, borderColor: colors.volt }]}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.volt }} />
      </View>
    );
  }
  if (row.status === "skipped") {
    return (
      <View style={[base, { borderWidth: 1.5, borderColor: "#3A3E44" }]}>
        <Icon icon={ChevronsRight} size={16} color={colors.ash2} mirror />
      </View>
    );
  }
  return (
    <View style={[base, { borderWidth: 1.5, borderColor: "#3A3E44" }]}>
      <Num size={16} weight="semibold" tone="ash" center>
        {row.index + 1}
      </Num>
    </View>
  );
}

// components/workout/WorkoutHeader.tsx — D20a: the top of every workout-mode
// screen (docs/design/screens/workout-set.html, workout-rest.html): minimize ·
// workout name + elapsed time · all exercises, then one progress segment per
// exercise, filling from the start edge (right in Hebrew).

import { View } from "react-native";
import { useTranslation } from "react-i18next";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import List from "lucide-react-native/icons/list";

import { AppText, colors, IconButton, Num } from "@/components/ui";
import { formatElapsed, progress, type WorkoutState } from "@/lib/workoutSession";

export function WorkoutHeader({
  state,
  now,
  title,
  onMinimize,
  onOverview,
}: {
  state: WorkoutState;
  now: number;
  title: string;
  onMinimize: () => void;
  onOverview: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <View style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton
          icon={ChevronDown}
          variant="dark"
          iconSize={22}
          accessibilityLabel={t("workout.mode.minimize")}
          onPress={onMinimize}
        />
        <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
          <AppText size={13} weight="medium" tone="ash" center numberOfLines={1}>
            {title}
          </AppText>
          <Num size={22} weight="semibold" tone="bone" tabular center>
            {formatElapsed(now - state.startedAt)}
          </Num>
        </View>
        <IconButton
          icon={List}
          mirror
          variant="dark"
          iconSize={22}
          accessibilityLabel={t("workout.mode.allExercises")}
          onPress={onOverview}
        />
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("workout.mode.progress")}
        style={{ flexDirection: "row", gap: 4 }}
      >
        {progress(state).map((p, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.ironLine,
              flexDirection: "row",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round(p.fraction * 100)}%`,
                borderRadius: 3,
                backgroundColor: p.skipped ? colors.ash2 : colors.volt,
              }}
            />
          </View>
        ))}
      </View>
    </>
  );
}

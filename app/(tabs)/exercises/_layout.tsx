// app/(tabs)/exercises/_layout.tsx — a Stack INSIDE the Exercises tab.
//
// The tab needs its own navigation stack so we can push from the list (index)
// to a single exercise ([id]) or the create screen (new). The parent tab hides
// its header (see (tabs)/_layout.tsx) so only this stack's headers show.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function ExercisesStackLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t("exercises.list.title") }} />
      <Stack.Screen
        name="new"
        options={{ title: t("exercises.list.newExercise"), presentation: "modal" }}
      />
      <Stack.Screen name="[id]" options={{ title: t("exercises.list.exercise") }} />
    </Stack>
  );
}

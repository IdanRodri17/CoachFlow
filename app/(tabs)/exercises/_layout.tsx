// app/(tabs)/exercises/_layout.tsx — a Stack INSIDE the Exercises tab.
//
// The tab needs its own navigation stack so we can push from the list (index)
// to a single exercise ([id]) or the create screen (new). The parent tab hides
// its header (see (tabs)/_layout.tsx) so only this stack's headers show.
//
// D29b: the list draws its own header (the design's "ספרייה" title); the
// form and detail screens keep the native header, styled to the design: chalk,
// no shadow, 17/600 title.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, fonts } from "@/components/ui";

export default function ExercisesStackLayout() {
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.chalk },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleAlign: "center",
        headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
        contentStyle: { backgroundColor: colors.chalk },
      }}
    >
      <Stack.Screen name="index" options={{ title: t("exercises.list.title"), headerShown: false }} />
      <Stack.Screen
        name="new"
        options={{ title: t("exercises.library.newExercise"), presentation: "modal" }}
      />
      <Stack.Screen name="[id]" options={{ title: t("exercises.list.exercise") }} />
    </Stack>
  );
}

// app/(tabs)/schedule/_layout.tsx — a Stack inside the Schedule tab (trainer-only).
// index (roster + upcoming) -> new (assign a workout).
//
// D24b: native headers styled to the design — chalk, no shadow, 17/600 title.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, fonts } from "@/components/ui";

export default function ScheduleStackLayout() {
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
      <Stack.Screen name="index" options={{ title: t("schedule.home.title") }} />
      <Stack.Screen name="new" options={{ title: t("schedule.home.scheduleWorkout") }} />
      <Stack.Screen name="[id]" options={{ title: t("schedule.home.editWorkout") }} />
    </Stack>
  );
}

// app/(tabs)/schedule/_layout.tsx — a Stack inside the Schedule tab (trainer-only).
// index (roster + upcoming) -> new (assign a workout).

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function ScheduleStackLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t("schedule.home.title") }} />
      <Stack.Screen name="new" options={{ title: t("schedule.home.scheduleWorkout") }} />
      <Stack.Screen name="[id]" options={{ title: t("schedule.home.editWorkout") }} />
    </Stack>
  );
}

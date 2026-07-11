// app/workout/_layout.tsx — a stack for the active-workout flow (outside the
// tabs). Gives the logging screen a header with a back button.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function WorkoutLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ title: t("workout.title") }} />
    </Stack>
  );
}

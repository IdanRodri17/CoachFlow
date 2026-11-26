// app/workout/_layout.tsx — a stack for the active-workout flow (outside the
// tabs). No stack header: recent iOS draws it see-through over the screen, and
// it covered the dark workout's top ("סיימת!", 2026-11-26). Every state draws
// its own way out: WorkoutHeader / FinishView minimize, the read-only pages'
// back bar, ScreenMessage's back.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { RouteErrorBoundary } from "@/components/ui/ErrorScreen";

// R6: a crash in a workout shows a retry instead of a white screen.
export const ErrorBoundary = RouteErrorBoundary;

export default function WorkoutLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ title: t("workout.title"), headerShown: false }} />
    </Stack>
  );
}

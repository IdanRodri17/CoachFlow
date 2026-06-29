// app/workout/_layout.tsx — a stack for the active-workout flow (outside the
// tabs). Gives the logging screen a header with a back button.

import { Stack } from "expo-router";

export default function WorkoutLayout() {
  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ title: "Workout" }} />
    </Stack>
  );
}

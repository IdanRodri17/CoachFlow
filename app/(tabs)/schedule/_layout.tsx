// app/(tabs)/schedule/_layout.tsx — a Stack inside the Schedule tab (trainer-only).
// index (roster + upcoming) -> new (assign a workout).

import { Stack } from "expo-router";

export default function ScheduleStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Schedule" }} />
      <Stack.Screen name="new" options={{ title: "Schedule a workout" }} />
      <Stack.Screen name="[id]" options={{ title: "Edit workout" }} />
    </Stack>
  );
}

// app/(tabs)/exercises/_layout.tsx — a Stack INSIDE the Exercises tab.
//
// The tab needs its own navigation stack so we can push from the list (index)
// to a single exercise ([id]) or the create screen (new). The parent tab hides
// its header (see (tabs)/_layout.tsx) so only this stack's headers show.

import { Stack } from "expo-router";

export default function ExercisesStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Exercises" }} />
      <Stack.Screen name="new" options={{ title: "New exercise", presentation: "modal" }} />
      <Stack.Screen name="[id]" options={{ title: "Exercise" }} />
    </Stack>
  );
}

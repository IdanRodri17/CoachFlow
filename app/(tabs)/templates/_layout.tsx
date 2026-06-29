// app/(tabs)/templates/_layout.tsx — a Stack inside the Templates tab.
// list (index) -> create (new) / edit ([id]). The parent tab hides its header
// so only this stack's headers show.

import { Stack } from "expo-router";

export default function TemplatesStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Templates" }} />
      <Stack.Screen name="new" options={{ title: "New template" }} />
      <Stack.Screen name="[id]" options={{ title: "Edit template" }} />
    </Stack>
  );
}

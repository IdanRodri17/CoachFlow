// app/(tabs)/templates/_layout.tsx — a Stack inside the Templates tab.
// list (index) -> create (new) / edit ([id]). The parent tab hides its header
// so only this stack's headers show.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function TemplatesStackLayout() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t("templates.list.title") }} />
      <Stack.Screen name="new" options={{ title: t("templates.list.newTitle") }} />
      <Stack.Screen name="[id]" options={{ title: t("templates.list.editTitle") }} />
    </Stack>
  );
}

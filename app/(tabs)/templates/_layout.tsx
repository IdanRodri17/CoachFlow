// app/(tabs)/templates/_layout.tsx — a Stack inside the Templates tab.
// list (index) -> create (new) / edit ([id]). The parent tab hides its header
// so only this stack's headers show.
//
// D29a: the list draws its own "ספרייה" header; the builder keeps the native
// header (its "שמירה" sits on the right), styled like the other stacks.

import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { colors, fonts } from "@/components/ui";

export default function TemplatesStackLayout() {
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
      <Stack.Screen name="index" options={{ title: t("templates.list.title"), headerShown: false }} />
      <Stack.Screen name="new" options={{ title: t("templates.list.newTitle") }} />
      <Stack.Screen name="[id]" options={{ title: t("templates.list.editTitle") }} />
    </Stack>
  );
}

// app/(tabs)/_layout.tsx — the signed-in tab navigator (routes under /).
//
// This layout is also the GUARD for the whole app area: before showing any tabs
// it checks auth state and redirects out if the user isn't ready. That keeps all
// the "who's allowed in" logic in one obvious place.
//
// V1 keeps the tab bar label-only (no icon library) to stay minimal. Icons can
// be added later if we want them.

import { ActivityIndicator, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";

import { profileComplete, useAuth } from "@/lib/auth";

export default function TabsLayout() {
  const { loading, session, profile } = useAuth();
  const { t } = useTranslation();

  // While auth is resolving, show a spinner (avoids flashing the wrong screen).
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  // Not signed in -> sign-in. Signed in but not onboarded -> onboarding.
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!profileComplete(profile)) return <Redirect href="/(auth)/onboarding" />;

  const isTrainer = profile?.role === "trainer";

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#0f172a" }}>
      <Tabs.Screen name="index" options={{ title: t("tabs.home") }} />
      {/* "exercises"/"templates" are folders with their own Stack, so hide the
          tab header (the inner stack provides headers). */}
      <Tabs.Screen name="exercises" options={{ title: t("tabs.exercises"), headerShown: false }} />
      {/* Templates + Schedule are trainer-only: href:null removes them for clients. */}
      <Tabs.Screen
        name="templates"
        options={{ title: t("tabs.templates"), headerShown: false, href: isTrainer ? undefined : null }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: t("tabs.schedule"), headerShown: false, href: isTrainer ? undefined : null }}
      />
      {/* Progress + Check-in are client-only. */}
      <Tabs.Screen
        name="progress"
        options={{ title: t("tabs.progress"), href: isTrainer ? null : undefined }}
      />
      <Tabs.Screen
        name="checkin"
        options={{ title: t("tabs.checkin"), href: isTrainer ? null : undefined }}
      />
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile") }} />
    </Tabs>
  );
}

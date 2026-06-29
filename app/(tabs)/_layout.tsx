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

import { profileComplete, useAuth } from "@/lib/auth";

export default function TabsLayout() {
  const { loading, session, profile } = useAuth();

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
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      {/* "exercises"/"templates" are folders with their own Stack, so hide the
          tab header (the inner stack provides headers). */}
      <Tabs.Screen name="exercises" options={{ title: "Exercises", headerShown: false }} />
      {/* Templates + Schedule are trainer-only: href:null removes them for clients. */}
      <Tabs.Screen
        name="templates"
        options={{ title: "Templates", headerShown: false, href: isTrainer ? undefined : null }}
      />
      <Tabs.Screen
        name="schedule"
        options={{ title: "Schedule", headerShown: false, href: isTrainer ? undefined : null }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

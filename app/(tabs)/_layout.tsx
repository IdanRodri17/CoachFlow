// app/(tabs)/_layout.tsx — the signed-in tab navigator (routes under /).
//
// This layout is also the GUARD for the whole app area: before showing any tabs
// it checks auth state and redirects out if the user isn't ready. That keeps all
// the "who's allowed in" logic in one obvious place.
//
// D21a: the bar itself is components/TabBar.tsx (icons, volt pill, the
// trainer's [+]). This file still owns which routes exist and the guards.
//
// 0038: it also opens the live schedule subscription for whoever is signed
// in (lib/useScheduleRealtime.ts), once, for every tab.

import { Redirect, Tabs } from "expo-router";
import { useTranslation } from "react-i18next";

import { profileComplete, useAuth } from "@/lib/auth";
import { authRoute } from "@/lib/authRoute";
import { ErrorScreen, RouteErrorBoundary } from "@/components/ui/ErrorScreen";
import { ScreenLoading } from "@/components/ui/ScreenState";
import { TabBar } from "@/components/TabBar";
import { useScheduleRealtime } from "@/lib/useScheduleRealtime";

// R6: a crash inside one tab shows this instead of taking the whole app down.
export const ErrorBoundary = RouteErrorBoundary;

export default function TabsLayout() {
  const { loading, session, profile, profileError, retryProfile } = useAuth();
  const { t } = useTranslation();
  // Before the guards below (rules of hooks); it waits for a profile itself.
  useScheduleRealtime(session?.user.id, profileComplete(profile) ? profile?.role : null);

  // While auth is resolving, show a spinner (avoids flashing the wrong screen).
  // U3: on the app's chalk, not white: this is what showed between the splash
  // and Home ("a white flash before the background appears").
  if (loading) return <ScreenLoading />;

  // Not signed in -> sign-in. Signed in but not onboarded -> onboarding.
  // A FAILED profile read (cold start, no cached profile) is a retry screen,
  // never onboarding: onboarding's Save would overwrite the real profile.
  const route = authRoute(session, profile, profileError);
  if (route === "signIn") return <Redirect href="/(auth)/sign-in" />;
  if (route === "retry") {
    return <ErrorScreen body={t("error.profileBody")} onRetry={() => void retryProfile()} />;
  }
  if (route === "onboarding") return <Redirect href="/(auth)/onboarding" />;
  // V12b: clients answer the intake questionnaire once before using the app.
  if (route === "intake") return <Redirect href="/intake" />;

  const isTrainer = profile?.role === "trainer";

  return (
    <Tabs tabBar={(props) => <TabBar {...props} isTrainer={isTrainer} />}>
      {/* Home draws its own header (date + greeting), per the design. */}
      <Tabs.Screen name="index" options={{ title: t("tabs.home"), headerShown: false }} />
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
      {/* D21c: Clients is a trainer tab and draws its own header. */}
      <Tabs.Screen
        name="clients"
        options={{ title: t("tabBar.clients"), headerShown: false, href: isTrainer ? undefined : null }}
      />
      {/* Progress + Nutrition are client-only. */}
      <Tabs.Screen
        name="progress"
        options={{ title: t("tabs.progress"), href: isTrainer ? null : undefined }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{ title: t("tabs.nutrition"), href: isTrainer ? null : undefined }}
      />
      {/* Profile / Settings draws its own header too. */}
      <Tabs.Screen name="profile" options={{ title: t("tabs.profile"), headerShown: false }} />
    </Tabs>
  );
}

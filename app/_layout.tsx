// app/_layout.tsx — the ROOT layout that wraps every screen.
//
// With Expo Router the app/ folder tree IS the navigation tree (like Next.js).
// This file installs the app-wide providers exactly once:
//   1. global.css        — NativeWind/Tailwind styles (import first).
//   2. lib/i18n           — i18next + RTL (V12a). Imported for its side effect:
//      it calls I18nManager.allowRTL/forceRTL at module load (still useful in
//      a dev-client/EAS build; a no-op in Expo Go — see lib/i18n.ts header).
//   3. GestureHandlerRootView / SafeAreaProvider — required by navigation + insets.
//      GestureHandlerRootView is deliberately left `direction`-neutral (plain
//      `{flex:1}`) — it's the native component that routes ALL touch/gesture
//      events for the app, not just a layout container, so the actual RTL fix
//      lives one level in, on a plain View, so only VISUAL Yoga mirroring is
//      affected, never gesture hit-testing.
//   4. LocaleProvider — expo-router's navigation chrome (e.g. the tab bar)
//      reads this context (not I18nManager) for its own left/right decisions.
//      Since SDK 56 expo-router no longer depends on @react-navigation/*, so
//      this replaced the old `LocaleDirContext.Provider` import from there.
//   5. QueryClientProvider — TanStack Query (server-state cache).
//   6. AuthProvider        — our session + profile context (lib/auth.tsx).
//   7. <Stack />           — the root navigator. Individual route groups
//      ((auth), (tabs)) decide for themselves who is allowed in, using <Redirect>.
//
// D19a: the design's three font families (docs/design/DESIGN.md §2.2) load
// here with useFonts while the splash screen stays up. Runtime loading because
// Expo Go can't use expo-font's build-time plugin. Each weight is imported
// from its own subpath: the package roots require every weight's .ttf, and
// Metro doesn't tree-shake, so that would bundle 28 files instead of 7. The
// map keys are the fontFamily names tailwind.config.js uses.

import "../global.css";
import "@/lib/i18n";

import { useEffect } from "react";
import { View } from "react-native";
import { LocaleProvider, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Karantina_700Bold } from "@expo-google-fonts/karantina/700Bold";
import { BarlowCondensed_600SemiBold } from "@expo-google-fonts/barlow-condensed/600SemiBold";
import { BarlowCondensed_700Bold } from "@expo-google-fonts/barlow-condensed/700Bold";
import { IBMPlexSansHebrew_400Regular } from "@expo-google-fonts/ibm-plex-sans-hebrew/400Regular";
import { IBMPlexSansHebrew_500Medium } from "@expo-google-fonts/ibm-plex-sans-hebrew/500Medium";
import { IBMPlexSansHebrew_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-hebrew/600SemiBold";
import { IBMPlexSansHebrew_700Bold } from "@expo-google-fonts/ibm-plex-sans-hebrew/700Bold";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { layoutDirection, restoreSavedLocale } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";

// Keep the splash up until the fonts are in (hidden in RootLayout below).
// Module scope, per the SDK 57 docs, so it runs before the first render.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function RootLayout() {
  // Subscribes this component to i18next's language-changed event so the
  // `direction` style below recomputes on every setLocale() call — no
  // reload, no I18nManager, works identically in Expo Go and a real build.
  useTranslation();
  const dir = layoutDirection();

  const [fontsLoaded, fontError] = useFonts({
    Karantina_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    IBMPlexSansHebrew_400Regular,
    IBMPlexSansHebrew_500Medium,
    IBMPlexSansHebrew_600SemiBold,
    IBMPlexSansHebrew_700Bold,
  });
  const fontsSettled = fontsLoaded || !!fontError;

  // Applies a previously-chosen language (Profile > Language) if it differs
  // from the device-locale default lib/i18n started with.
  useEffect(() => {
    restoreSavedLocale();
  }, []);

  // A font that fails to load must not lock the app behind the splash: text
  // then falls back to the system font, and the reason goes to the dev log.
  useEffect(() => {
    if (!fontsSettled) return;
    if (fontError && __DEV__) console.warn("[fonts] failed to load:", fontError.message);
    SplashScreen.hide();
  }, [fontsSettled, fontError]);

  // After every hook (rules of hooks): nothing renders until the fonts settle.
  if (!fontsSettled) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, direction: dir }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <LocaleProvider direction={dir}>
                <Stack screenOptions={{ headerShown: false }} />
              </LocaleProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

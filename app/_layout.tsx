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
//   4. LocaleDirContext.Provider — React Navigation reads this (not
//      I18nManager) for its own left/right decisions (e.g. the tab bar).
//   5. QueryClientProvider — TanStack Query (server-state cache).
//   6. AuthProvider        — our session + profile context (lib/auth.tsx).
//   7. <Stack />           — the root navigator. Individual route groups
//      ((auth), (tabs)) decide for themselves who is allowed in, using <Redirect>.

import "../global.css";
import "@/lib/i18n";

import { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { LocaleDirContext } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { layoutDirection, restoreSavedLocale } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";

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

  // Applies a previously-chosen language (Profile > Language) if it differs
  // from the device-locale default lib/i18n started with.
  useEffect(() => {
    restoreSavedLocale();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, direction: dir }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <LocaleDirContext.Provider value={dir}>
                <Stack screenOptions={{ headerShown: false }} />
              </LocaleDirContext.Provider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}

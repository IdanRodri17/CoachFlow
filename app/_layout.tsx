// app/_layout.tsx — the ROOT layout that wraps every screen.
//
// With Expo Router the app/ folder tree IS the navigation tree (like Next.js).
// This file installs the app-wide providers exactly once:
//   1. global.css        — NativeWind/Tailwind styles (import first).
//   2. lib/i18n           — i18next + RTL (V12a). Imported for its side effect:
//      it calls I18nManager.allowRTL/forceRTL at module load, before first
//      render, so a Hebrew-locale device is already mirrored correctly.
//   3. GestureHandlerRootView / SafeAreaProvider — required by navigation + insets.
//   4. QueryClientProvider — TanStack Query (server-state cache).
//   5. AuthProvider        — our session + profile context (lib/auth.tsx).
//   6. <Stack />           — the root navigator. Individual route groups
//      ((auth), (tabs)) decide for themselves who is allowed in, using <Redirect>.

import "../global.css";
import "@/lib/i18n";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { restoreSavedLocale } from "@/lib/i18n";
import { AuthProvider } from "@/lib/auth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function RootLayout() {
  // Applies a previously-chosen language (Profile > Language) if it differs
  // from the device-locale default lib/i18n started with.
  useEffect(() => {
    restoreSavedLocale();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

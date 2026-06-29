// app/_layout.tsx — the ROOT layout that wraps every screen.
//
// With Expo Router the app/ folder tree IS the navigation tree (like Next.js).
// This file installs the app-wide providers exactly once:
//   1. global.css        — NativeWind/Tailwind styles (import first).
//   2. RTL support        — enabled from day one so Hebrew (V12) works later.
//   3. GestureHandlerRootView / SafeAreaProvider — required by navigation + insets.
//   4. QueryClientProvider — TanStack Query (server-state cache).
//   5. AuthProvider        — our session + profile context (lib/auth.tsx).
//   6. <Stack />           — the root navigator. Individual route groups
//      ((auth), (tabs)) decide for themselves who is allowed in, using <Redirect>.

import "../global.css";

import { I18nManager } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider } from "@/lib/auth";

// RTL-AWARE FROM DAY ONE (a CoachFlow rule — see CLAUDE.md / SRS §6).
// allowRTL permits mirroring for RTL locales; the actual Hebrew toggle lands in V12.
I18nManager.allowRTL(true);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export default function RootLayout() {
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

// app/_layout.tsx — the ROOT layout for the whole app.
//
// With Expo Router, the file tree under app/ IS the navigation tree (just like
// the app/ folder in Next.js). `_layout.tsx` wraps every screen, so it's where
// we install app-wide providers exactly once.
//
// What we set up here:
//   1. global.css  — load NativeWind/Tailwind styles (must be imported first).
//   2. RTL support — enabled from day one so Hebrew (V12) works without a rewrite.
//   3. GestureHandlerRootView — required by the navigation stack for gestures.
//   4. SafeAreaProvider — lets screens avoid notches / status bars.
//   5. QueryClientProvider — TanStack Query, our server-state/caching layer.
//   6. <Stack /> — Expo Router's default stack navigator; it renders whichever
//      screen file matches the current route (e.g. app/index.tsx).

import "../global.css";

import { I18nManager } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// RTL-AWARE FROM DAY ONE (a CoachFlow rule — see CLAUDE.md / SRS §6).
// allowRTL(true) permits the layout engine to mirror when the locale is RTL.
// We do NOT forceRTL here — the actual Hebrew/RTL toggle is wired in V12 (i18n).
// Calling this at module load means it runs once, before any screen renders.
I18nManager.allowRTL(true);

// One QueryClient instance for the entire app. Created at module scope (not
// inside the component) so it survives re-renders and isn't recreated.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep cached data "fresh" for 30s before refetching in the background.
      staleTime: 30_000,
      // Retry a failed request once (mobile networks blip); avoids long hangs.
      retry: 1,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          {/* headerShown:false for now — screens are bare during Session 0.
              Per-screen headers/tabs arrive with the role-aware shell in V1. */}
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

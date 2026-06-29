// app/index.tsx — the home screen at route "/".
//
// This is the ONLY screen in Session 0: a placeholder that proves the whole
// foundation works end to end. If you can see this styled text in Expo Go, then
// Expo Router (routing), NativeWind (the className styling), and the providers in
// _layout.tsx are all wired correctly. Real features start in V1.

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    // className strings below are Tailwind utilities, powered by NativeWind.
    // flex-1 = fill the screen; items/justify-center = center content.
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-3xl font-bold text-slate-900">CoachFlow</Text>
        <Text className="mt-2 text-base text-slate-500">
          Session 0 — foundation ready
        </Text>
        <Text className="mt-6 text-center text-sm text-slate-400">
          Expo Router · NativeWind · TanStack Query · Supabase
        </Text>
      </View>
    </SafeAreaView>
  );
}

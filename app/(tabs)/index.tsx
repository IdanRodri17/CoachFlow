// app/(tabs)/index.tsx — the Home tab (route: /).
//
// V1 shows a role-aware EMPTY STATE: trainers and clients see different copy.
// The real content (roster/dashboard for trainers; today's workout for clients)
// is filled in by later versions (V2+). This proves role-awareness works end to end.

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

export default function HomeScreen() {
  const { profile } = useAuth();
  const isTrainer = profile?.role === "trainer";

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-bold text-slate-900">
          Hi {profile?.display_name ?? ""} 👋
        </Text>
        <Text className="mt-1 text-base text-slate-500">
          {isTrainer ? "Trainer dashboard" : "Your workouts"}
        </Text>

        {/* Empty-state card */}
        <View className="mt-8 items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
          <Text className="text-center text-base font-medium text-slate-700">
            {isTrainer
              ? "No clients yet"
              : "No workouts scheduled yet"}
          </Text>
          <Text className="mt-2 text-center text-sm text-slate-400">
            {isTrainer
              ? "Your roster, exercise library, and templates arrive in the next steps."
              : "Your trainer will assign your first workout soon."}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// app/(tabs)/nutrition.tsx — the client's AI nutrition plan tab (V15 follow-up).
//
// Was a Profile > "Nutrition plan" link out to app/nutrition-plan.tsx; promoted
// to its own first-class tab (Check-in moved into the Progress tab to make room —
// see app/(tabs)/progress.tsx). AI-generated plan text is unbounded in length, so
// this screen is just a ScrollView showing the client's latest plan.

import { Redirect } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function NutritionScreen() {
  const { t } = useTranslation();
  const { session, profile } = useAuth();

  if (profile && profile.role !== "client") return <Redirect href="/" />;

  const nutritionPlan = useQuery({
    queryKey: ["nutrition-plan-latest", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nutrition_plans")
        .select("plan_markdown, created_at")
        .eq("client_id", session!.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 py-6">
        <Text className="w-full text-left text-2xl font-bold text-slate-900">{t("profile.nutritionPlan")}</Text>

        {nutritionPlan.isLoading ? (
          <ActivityIndicator className="mt-6" />
        ) : nutritionPlan.error ? (
          <Text className="mt-4 w-full text-left text-sm text-red-600">
            {(nutritionPlan.error as Error).message}
          </Text>
        ) : nutritionPlan.data ? (
          <View className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Text className="w-full text-left text-sm text-slate-800">{nutritionPlan.data.plan_markdown}</Text>
          </View>
        ) : (
          <Text className="mt-4 w-full text-left text-sm text-slate-400">{t("profile.nutritionPlanNoneYet")}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

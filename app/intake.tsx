// app/intake.tsx — V12b: one-time client intake questionnaire.
//
// Shown to a client exactly once: the (tabs) guard redirects here while
// profiles.intake is null. Saving stores whatever was filled in (at least {}),
// so the form never nags again — every field is optional. Trainers see the
// answers on their client-detail page (app/dashboard/[refId].tsx).
// experience is stored as a raw key ("beginner" | ...) so each locale can
// translate it at display time.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { directionalTextClassName } from "@/lib/i18n";

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Experience = (typeof EXPERIENCE_LEVELS)[number];

export default function IntakeScreen() {
  const { t } = useTranslation();
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();

  const [goals, setGoals] = useState("");
  const [injuries, setInjuries] = useState("");
  const [equipment, setEquipment] = useState("");
  const [experience, setExperience] = useState<Experience | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const intake: Record<string, string> = {};
      if (goals.trim()) intake.goals = goals.trim();
      if (injuries.trim()) intake.injuries = injuries.trim();
      if (equipment.trim()) intake.equipment = equipment.trim();
      if (experience) intake.experience = experience;

      const { error } = await supabase
        .from("profiles")
        .update({ intake })
        .eq("id", session!.user.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await refreshProfile();
      router.replace("/");
    },
  });

  // Only clients who haven't answered yet belong here. (After all hooks —
  // this condition flips once the save above refreshes the profile.)
  if (profile && (profile.role !== "client" || (profile.intake != null && !save.isPending && !save.isSuccess))) {
    return <Redirect href="/" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <Text className="w-full text-left text-2xl font-bold text-slate-900">{t("intake.title")}</Text>
        <Text className="mt-1 mb-6 w-full text-left text-base text-slate-500">{t("intake.subtitle")}</Text>

        <Field
          label={t("intake.goals")}
          placeholder={t("intake.goalsPlaceholder")}
          value={goals}
          onChangeText={setGoals}
        />
        <Field
          label={t("intake.injuries")}
          placeholder={t("intake.injuriesPlaceholder")}
          value={injuries}
          onChangeText={setInjuries}
        />
        <Field
          label={t("intake.equipment")}
          placeholder={t("intake.equipmentPlaceholder")}
          value={equipment}
          onChangeText={setEquipment}
        />

        <Text className="mb-2 w-full text-left text-sm font-medium text-slate-700">
          {t("intake.experience")}
        </Text>
        <View className="mb-6 flex-row gap-2">
          {EXPERIENCE_LEVELS.map((level) => {
            const selected = experience === level;
            return (
              <Pressable
                key={level}
                className={`flex-1 items-center rounded-xl border px-3 py-2.5 ${
                  selected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white active:bg-slate-100"
                }`}
                onPress={() => setExperience(selected ? null : level)}
              >
                <Text className={`text-sm font-semibold ${selected ? "text-white" : "text-slate-700"}`}>
                  {t(`intake.${level}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {save.error ? (
          <Text className="mb-3 w-full text-left text-sm text-red-600">{(save.error as Error).message}</Text>
        ) : null}

        <Pressable
          className="items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
          disabled={save.isPending}
          onPress={() => save.mutate()}
        >
          {save.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">{t("intake.save")}</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View className="mb-6">
      <Text className="mb-2 w-full text-left text-sm font-medium text-slate-700">{label}</Text>
      <TextInput
        className={`min-h-[88px] rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 ${directionalTextClassName()}`}
        placeholder={placeholder}
        placeholderTextColor="#cbd5e1"
        multiline
        textAlignVertical="top"
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

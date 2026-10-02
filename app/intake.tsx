// app/intake.tsx — V12b: one-time client intake questionnaire.
//
// Shown to a client exactly once: the (tabs) guard redirects here while
// profiles.intake is null. Saving stores whatever was filled in (at least {}),
// so the form never nags again — every field is optional, and "Skip" saves {}.
// Trainers see the answers on their client-detail page (app/dashboard/[refId].tsx).
//
// D30b: rebuilt to docs/design/screens/auth-intake.html — chips instead of
// free-text boxes. The stored shape is unchanged: goals / injuries / equipment
// are the chosen chip labels joined into one string (in the client's language,
// as the free text was), experience is still the raw key so each locale can
// translate it at display time. Intake runs BEFORE the client joins a trainer,
// so the copy says "your trainer", never a name.

import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  AppText,
  Button,
  colors,
  Display,
  Input,
  Segmented,
  SelectChip,
  TextButton,
} from "@/components/ui";

const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
type Experience = (typeof EXPERIENCE_LEVELS)[number];

const GOALS = ["weightLoss", "toning", "strength", "muscle", "fitness", "rehab"] as const;
const INJURIES = ["none", "lowerBack", "knees", "shoulders", "other"] as const;
const WHERE = ["gym", "home", "none"] as const;
type Injury = (typeof INJURIES)[number];

export default function IntakeScreen() {
  const { t } = useTranslation();
  const { session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [goals, setGoals] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [injuryDetails, setInjuryDetails] = useState("");
  const [where, setWhere] = useState<string | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);

  const save = useMutation({
    mutationFn: async (skip: boolean) => {
      const intake: Record<string, string> = {};
      if (!skip) {
        const goalText = goals.map((g) => t(`intake.goalOptions.${g}`)).join(", ");
        const injuryText = [
          ...injuries.map((i) => t(`intake.injuryOptions.${i}`)),
          injuryDetails.trim(),
        ]
          .filter(Boolean)
          .join(", ");
        if (goalText) intake.goals = goalText;
        if (injuryText) intake.injuries = injuryText;
        if (where) intake.equipment = t(`intake.whereOptions.${where}`);
        if (experience) intake.experience = experience;
      }

      const { error } = await supabase.from("profiles").update({ intake }).eq("id", session!.user.id);
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

  function toggleGoal(g: string) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  // "None" and the actual injuries exclude each other.
  function toggleInjury(i: Injury) {
    setInjuries((prev) => {
      if (prev.includes(i)) return prev.filter((x) => x !== i);
      if (i === "none") return ["none"];
      return [...prev.filter((x) => x !== "none"), i];
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.chalk }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 20),
            paddingHorizontal: 20,
            gap: 24,
          }}
        >
          {/* The reference also has a back button here; intake comes after
              onboarding is saved, so there's nothing to go back to. */}
          <View style={{ height: 52, flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }} />
            <TextButton
              label={t("intake.skip")}
              size={15}
              disabled={save.isPending}
              onPress={() => save.mutate(true)}
              style={{ paddingHorizontal: 12 }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <Display size={48}>{t("intake.title")}</Display>
            <AppText size={16} lineHeight={24} tone="graphite">
              {t("intake.lead")}
            </AppText>
          </View>

          <Question title={t("intake.goalQuestion")}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {GOALS.map((g) => (
                <SelectChip
                  key={g}
                  label={t(`intake.goalOptions.${g}`)}
                  selected={goals.includes(g)}
                  onPress={() => toggleGoal(g)}
                />
              ))}
            </View>
          </Question>

          <Question title={t("intake.injuries")}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {INJURIES.map((i) => (
                <SelectChip
                  key={i}
                  label={t(`intake.injuryOptions.${i}`)}
                  selected={injuries.includes(i)}
                  onPress={() => toggleInjury(i)}
                />
              ))}
            </View>
            <Input
              size="md"
              value={injuryDetails}
              onChangeText={setInjuryDetails}
              placeholder={t("intake.injuryDetails")}
              accessibilityLabel={t("intake.injuryDetails")}
              maxLength={200}
            />
          </Question>

          <Question title={t("intake.whereQuestion")}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {WHERE.map((w) => (
                <SelectChip
                  key={w}
                  label={t(`intake.whereOptions.${w}`)}
                  selected={where === w}
                  onPress={() => setWhere(where === w ? null : w)}
                />
              ))}
            </View>
          </Question>

          <Question title={t("intake.experience")}>
            <Segmented
              size="lg"
              value={experience}
              onChange={setExperience}
              options={EXPERIENCE_LEVELS.map((level) => ({ value: level, label: t(`intake.${level}`) }))}
            />
          </Question>

          <View style={{ flex: 1 }} />

          {save.error ? (
            <AppText size={14} tone="ember">
              {(save.error as Error).message}
            </AppText>
          ) : null}

          <Button label={t("intake.save")} size={56} block loading={save.isPending} onPress={() => save.mutate(false)} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Question({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <AppText size={17} weight="semibold" lineHeight={23}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

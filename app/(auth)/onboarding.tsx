// app/(auth)/onboarding.tsx — first-run setup (route: /(auth)/onboarding).
//
// Shown once, right after a brand-new user verifies their OTP and has no profile
// yet. Collects: display name, role (trainer/client), and the two required
// consents (terms of use + health disclaimer). On save it writes the profile row
// — stamping accepted_terms_at / accepted_health_disclaimer_at (SRS V1) — then the
// guards route the user into the app.
//
// D30a: rebuilt to docs/design/screens/auth-onboarding.html — two role cards
// and the two consent checkboxes. The role is still locked once saved (0013).

import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import ClipboardList from "lucide-react-native/icons/clipboard-list";
import Dumbbell from "lucide-react-native/icons/dumbbell";

import { supabase } from "@/lib/supabase";
import { profileComplete, useAuth } from "@/lib/auth";
import {
  AppText,
  Button,
  Checkbox,
  colors,
  Display,
  FieldLabel,
  fonts,
  Icon,
  Input,
  type IconComponent,
} from "@/components/ui";

type Role = "trainer" | "client";

export default function OnboardingScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedHealth, setAcceptedHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No session? Back to sign-in. Already onboarded? Into the app. (After all hooks.)
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profileComplete(profile)) return <Redirect href="/" />;

  const canSubmit = displayName.trim().length > 0 && role !== null && acceptedTerms && acceptedHealth;

  async function handleSave() {
    if (!session || !role) return;
    setError(null);
    setBusy(true);
    const now = new Date().toISOString();
    // upsert = insert the row (or update if it somehow exists). locale defaults
    // to 'he' in the DB, so we don't set it here.
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      role,
      display_name: displayName.trim(),
      accepted_terms_at: now,
      accepted_health_disclaimer_at: now,
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    // Refresh the cached profile so profileComplete() flips true -> guards route on.
    await refreshProfile();
    setBusy(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.chalk }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 16,
            paddingBottom: Math.max(insets.bottom, 20),
            paddingHorizontal: 24,
            gap: 22,
          }}
        >
          <View style={{ gap: 8 }}>
            <Display size={52}>{t("onboarding.title")}</Display>
            <AppText size={16} tone="graphite">
              {t("onboarding.lead")}
            </AppText>
          </View>

          <View style={{ gap: 8 }}>
            <FieldLabel>{t("onboarding.nameQuestion")}</FieldLabel>
            <Input
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={t("onboarding.namePlaceholder")}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              editable={!busy}
              accessibilityLabel={t("onboarding.nameQuestion")}
            />
          </View>

          <View style={{ gap: 10 }}>
            <FieldLabel>{t("onboarding.iAm")}</FieldLabel>
            <View accessibilityRole="radiogroup" style={{ flexDirection: "row", gap: 10 }}>
              <RoleCard
                icon={ClipboardList}
                title={t("onboarding.trainerTitle")}
                description={t("onboarding.trainerDesc")}
                selected={role === "trainer"}
                disabled={busy}
                onPress={() => setRole("trainer")}
              />
              <RoleCard
                icon={Dumbbell}
                title={t("onboarding.clientTitle")}
                description={t("onboarding.clientDesc")}
                selected={role === "client"}
                disabled={busy}
                onPress={() => setRole("client")}
              />
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Checkbox checked={acceptedTerms} disabled={busy} onToggle={() => setAcceptedTerms((v) => !v)}>
              {t("onboarding.termsPrefix")}
              <Text style={{ fontFamily: fonts.semibold, textDecorationLine: "underline" }}>
                {t("onboarding.termsLink")}
              </Text>
            </Checkbox>
            <Checkbox checked={acceptedHealth} disabled={busy} onToggle={() => setAcceptedHealth((v) => !v)}>
              {t("onboarding.health")}
            </Checkbox>
          </View>

          {error ? (
            <AppText size={14} tone="ember">
              {error}
            </AppText>
          ) : null}

          <View style={{ flex: 1 }} />

          <Button
            label={t("common.continue")}
            size={56}
            block
            loading={busy}
            disabled={!canSubmit}
            onPress={handleSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// A role card: 168 tall, 1px line.strong, or 2px ink with a volt check badge
// in the end corner when selected.
function RoleCard({
  icon,
  title,
  description,
  selected,
  disabled,
  onPress,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 168,
        borderRadius: 20,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.ink : colors.lineStrong,
        backgroundColor: colors.paper,
        // 1 dp less padding when the border is 1 dp thicker, so nothing jumps.
        padding: selected ? 15 : 16,
        gap: 10,
        alignItems: "flex-start",
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {selected ? (
        <View
          style={{
            position: "absolute",
            top: 12,
            end: 12,
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: colors.volt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon icon={Check} size={15} color={colors.ink} strokeWidth={3} />
        </View>
      ) : null}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: selected ? colors.ink : colors.mist,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon icon={icon} size={24} color={selected ? colors.volt : colors.ink} />
      </View>
      <AppText size={18} weight="bold" lineHeight={24}>
        {title}
      </AppText>
      <AppText size={13} lineHeight={19} tone="graphite">
        {description}
      </AppText>
    </Pressable>
  );
}

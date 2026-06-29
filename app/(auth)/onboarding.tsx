// app/(auth)/onboarding.tsx — first-run setup (route: /(auth)/onboarding).
//
// Shown once, right after a brand-new user verifies their OTP and has no profile
// yet. Collects: display name, role (trainer/client), and the two required
// consents (terms of use + health disclaimer). On save it writes the profile row
// — stamping accepted_terms_at / accepted_health_disclaimer_at (SRS V1) — then the
// guards route the user into the app.

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";

import { supabase } from "@/lib/supabase";
import { profileComplete, useAuth } from "@/lib/auth";

type Role = "trainer" | "client";

export default function OnboardingScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedHealth, setAcceptedHealth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No session? Back to sign-in. Already onboarded? Into the app.
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profileComplete(profile)) return <Redirect href="/" />;

  const canSubmit =
    displayName.trim().length > 0 && role !== null && acceptedTerms && acceptedHealth;

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
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 py-8">
        <Text className="text-2xl font-bold text-slate-900">Welcome 👋</Text>
        <Text className="mt-1 mb-6 text-base text-slate-500">
          Let's set up your account.
        </Text>

        {/* Display name */}
        <Text className="mb-2 text-sm font-medium text-slate-700">Your name</Text>
        <TextInput
          className="mb-6 rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
          placeholder="e.g. Idan"
          placeholderTextColor="#94a3b8"
          value={displayName}
          onChangeText={setDisplayName}
          editable={!busy}
        />

        {/* Role */}
        <Text className="mb-2 text-sm font-medium text-slate-700">I am a…</Text>
        <View className="mb-6 flex-row gap-3">
          {(["trainer", "client"] as Role[]).map((r) => {
            const selected = role === r;
            return (
              <Pressable
                key={r}
                className={`flex-1 items-center rounded-xl border px-4 py-3 ${
                  selected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
                }`}
                disabled={busy}
                onPress={() => setRole(r)}
              >
                <Text
                  className={`text-base font-semibold ${
                    selected ? "text-white" : "text-slate-700"
                  }`}
                >
                  {r === "trainer" ? "Trainer" : "Client"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Consents */}
        <Consent
          checked={acceptedTerms}
          disabled={busy}
          onToggle={() => setAcceptedTerms((v) => !v)}
          label="I accept the Terms of Use."
        />
        <Consent
          checked={acceptedHealth}
          disabled={busy}
          onToggle={() => setAcceptedHealth((v) => !v)}
          label="I understand I should consult a physician before starting any exercise program."
        />

        {error ? <Text className="mt-4 text-sm text-red-600">{error}</Text> : null}

        <Pressable
          className={`mt-8 items-center rounded-xl px-4 py-3 ${
            canSubmit ? "bg-slate-900 active:opacity-80" : "bg-slate-300"
          }`}
          disabled={!canSubmit || busy}
          onPress={handleSave}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">Continue</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// A simple tappable checkbox row.
function Consent({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable
      className="mb-4 flex-row items-start gap-3"
      disabled={disabled}
      onPress={onToggle}
    >
      <View
        className={`mt-0.5 h-6 w-6 items-center justify-center rounded-md border ${
          checked ? "border-slate-900 bg-slate-900" : "border-slate-400 bg-white"
        }`}
      >
        {checked ? <Text className="text-sm font-bold text-white">✓</Text> : null}
      </View>
      <Text className="flex-1 text-sm leading-5 text-slate-700">{label}</Text>
    </Pressable>
  );
}

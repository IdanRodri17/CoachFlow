// app/(auth)/sign-in.tsx — the OTP sign-in screen (route: /(auth)/sign-in).
//
// Two phases in one screen:
//   Phase "enter" — type your email, we send a one-time passcode (OTP).
//   Phase "code"  — type the 6-digit code from the email, we verify it.
// On success Supabase creates a session; the route guards below + the (tabs)
// guard then send you to onboarding (new user) or straight into the app.

import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";

import { AUTH_MODE, profileComplete, sendOtp, useAuth, verifyOtp } from "@/lib/auth";

export default function SignInScreen() {
  const { session, profile } = useAuth();
  const [phase, setPhase] = useState<"enter" | "code">("enter");
  const [identifier, setIdentifier] = useState(""); // email (or phone in sms mode)
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in? Don't show sign-in — let the guards route onward.
  if (session) {
    return profileComplete(profile) ? (
      <Redirect href="/" />
    ) : (
      <Redirect href="/(auth)/onboarding" />
    );
  }

  const isEmail = AUTH_MODE === "email";

  async function handleSendCode() {
    setError(null);
    setBusy(true);
    const { error } = await sendOtp(identifier.trim());
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPhase("code");
  }

  async function handleVerify() {
    setError(null);
    setBusy(true);
    const { error } = await verifyOtp(identifier.trim(), code.trim());
    setBusy(false);
    if (error) setError(error.message);
    // On success, useAuth() updates and the <Redirect> above takes over.
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center px-6">
          <Text className="text-3xl font-bold text-slate-900">CoachFlow</Text>
          <Text className="mt-1 mb-8 text-base text-slate-500">
            {phase === "enter"
              ? `Sign in with your ${isEmail ? "email" : "phone number"}`
              : `Enter the code we sent to ${identifier}`}
          </Text>

          {phase === "enter" ? (
            <TextInput
              className="rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
              placeholder={isEmail ? "you@example.com" : "+972…"}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={isEmail ? "email-address" : "phone-pad"}
              value={identifier}
              onChangeText={setIdentifier}
              editable={!busy}
            />
          ) : (
            <TextInput
              className="rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[4px] text-slate-900"
              placeholder="00000000"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              // Supabase email OTP can be 6–8 digits depending on project settings;
              // this project issues 8. Allow up to 8 so the full code fits.
              maxLength={8}
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />
          )}

          {error ? (
            <Text className="mt-3 text-sm text-red-600">{error}</Text>
          ) : null}

          <Pressable
            className="mt-6 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
            disabled={busy}
            onPress={phase === "enter" ? handleSendCode : handleVerify}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-base font-semibold text-white">
                {phase === "enter" ? "Send code" : "Verify & continue"}
              </Text>
            )}
          </Pressable>

          {phase === "code" ? (
            <Pressable
              className="mt-4 items-center"
              disabled={busy}
              onPress={() => {
                setPhase("enter");
                setCode("");
                setError(null);
              }}
            >
              <Text className="text-sm text-slate-500">
                Use a different {isEmail ? "email" : "number"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

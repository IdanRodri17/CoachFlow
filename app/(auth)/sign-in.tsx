// app/(auth)/sign-in.tsx — the OTP sign-in screen (route: /(auth)/sign-in).
//
// Two phases in one screen:
//   Phase "enter" — type your phone (or email, in email mode), we send a
//                   one-time passcode (OTP).
//   Phase "code"  — type the code from the SMS (or email), we verify it.
// On success Supabase creates a session; the route guards below + the (tabs)
// guard then send you to onboarding (new user) or straight into the app.
//
// V18a: phone numbers are normalized to E.164 before they reach Auth (see
// toE164IL), the code field opts into the OS one-time-code autofill, and
// Auth's English errors are shown as translated lines (raw text → dev log).

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
import { useTranslation } from "react-i18next";

import { AUTH_MODE, profileComplete, sendOtp, toE164IL, useAuth, verifyOtp } from "@/lib/auth";
import { LTR_INPUT_STYLE, LTR_WRITING_DIRECTION_ONLY } from "@/lib/i18n";

// Auth error codes that mean "slow down" rather than "something's wrong".
const RATE_LIMIT_CODES = new Set(["over_sms_send_rate_limit", "over_request_rate_limit"]);

export default function SignInScreen() {
  const { session, profile } = useAuth();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<"enter" | "code">("enter");
  const [identifier, setIdentifier] = useState(""); // email (or phone in sms mode), as typed
  // What the code was actually sent to (E.164 in sms mode) — verify must use
  // exactly this, not whatever is in the input.
  const [sentTo, setSentTo] = useState("");
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
  const codeLength = isEmail ? 8 : 6; // this project issues 8-digit email codes, 6-digit SMS codes

  async function handleSendCode() {
    setError(null);
    const target = isEmail ? identifier.trim() : toE164IL(identifier);
    if (!target) {
      setError(t("signIn.invalidPhone"));
      return;
    }
    setBusy(true);
    const { error } = await sendOtp(target);
    setBusy(false);
    if (error) {
      if (__DEV__) console.warn("[sign-in] sendOtp failed:", error.code, error.message);
      setError(RATE_LIMIT_CODES.has(error.code ?? "") ? t("signIn.tooManyAttempts") : t("signIn.sendFailed"));
      return;
    }
    setSentTo(target);
    setPhase("code");
  }

  async function handleVerify() {
    setError(null);
    setBusy(true);
    const { error } = await verifyOtp(sentTo, code.trim());
    setBusy(false);
    if (error) {
      if (__DEV__) console.warn("[sign-in] verifyOtp failed:", error.code, error.message);
      setError(RATE_LIMIT_CODES.has(error.code ?? "") ? t("signIn.tooManyAttempts") : t("signIn.invalidCode"));
    }
    // On success, useAuth() updates and the <Redirect> above takes over.
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center px-6">
          <Text className="w-full text-left text-3xl font-bold text-slate-900">{t("signIn.appName")}</Text>
          <Text className="mt-1 mb-8 w-full text-left text-base text-slate-500">
            {phase === "enter"
              ? isEmail
                ? t("signIn.subtitleEmail")
                : t("signIn.subtitlePhone")
              : t("signIn.subtitleCode", {
                  // Shown in local form ("0501234567"): a leading "+" inside a
                  // Hebrew sentence gets reordered by the bidi algorithm and
                  // renders as "972…+"; plain digits stay one LTR run.
                  identifier: isEmail ? sentTo : `0${sentTo.slice(4)}`,
                })}
          </Text>

          {phase === "enter" ? (
            <TextInput
              className="rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900"
              style={LTR_INPUT_STYLE}
              placeholder={isEmail ? t("signIn.emailPlaceholder") : t("signIn.phonePlaceholder")}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={isEmail ? "email-address" : "phone-pad"}
              textContentType={isEmail ? "emailAddress" : "telephoneNumber"}
              autoComplete={isEmail ? "email" : "tel"}
              value={identifier}
              onChangeText={setIdentifier}
              editable={!busy}
            />
          ) : (
            <TextInput
              className="rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[4px] text-slate-900"
              style={LTR_WRITING_DIRECTION_ONLY}
              placeholder={"0".repeat(codeLength)}
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
              // Offer the code from the incoming SMS above the keyboard
              // (iOS reads textContentType, Android the autoComplete hint).
              textContentType="oneTimeCode"
              autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
              maxLength={codeLength}
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />
          )}

          {error ? (
            <Text className="mt-3 w-full text-left text-sm text-red-600">{error}</Text>
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
                {phase === "enter" ? t("signIn.sendCode") : t("signIn.verifyAndContinue")}
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
                {isEmail ? t("signIn.useDifferentEmail") : t("signIn.useDifferentNumber")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

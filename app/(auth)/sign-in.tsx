// app/(auth)/sign-in.tsx — the SMS sign-in screen (route: /(auth)/sign-in).
//
// Two phases in one screen:
//   Phase "enter" — type your phone, we send a one-time passcode (OTP).
//   Phase "code"  — type the 6-digit code from the SMS, we verify it.
// On success Supabase creates a session; the route guards below + the (tabs)
// guard then send you to onboarding (new user) or straight into the app.
//
// V18a: phone numbers are normalized to E.164 before they reach Auth (see
// toE164IL), the code field opts into the OS one-time-code autofill, and
// Auth's English errors are shown as translated lines (raw text → dev log).
// V18c: SMS is the only way in; lib/auth's email branch is a dormant fallback
// and this screen no longer draws it.
//
// D30a: rebuilt to docs/design/screens/auth-sign-in.html + auth-code.html.
// The code is one hidden input drawn as six boxes (CodeInput), so iOS/Android
// autofill fills all six at once, and it verifies by itself on the 6th digit.

import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import ChevronLeft from "lucide-react-native/icons/chevron-left";

import { profileComplete, sendOtp, toE164IL, useAuth, verifyOtp } from "@/lib/auth";
import { ltr } from "@/lib/i18n";
import {
  AppText,
  Button,
  CodeInput,
  colors,
  Display,
  FieldLabel,
  fonts,
  Icon,
  IconButton,
  Input,
  TextButton,
} from "@/components/ui";

const CODE_LENGTH = 6;
// Supabase's default minimum gap between two SMS to the same number
// (Authentication → Rate limits). If the dashboard value is raised, raise this
// too; a too-early resend still lands on the "too many attempts" line below.
const RESEND_SECONDS = 60;

// Auth error codes that mean "slow down" rather than "something's wrong".
const RATE_LIMIT_CODES = new Set(["over_sms_send_rate_limit", "over_request_rate_limit"]);

/** +972541234567 → "054-123-4567", the way the reference prints it. */
function localPhone(e164: string): string {
  const d = `0${e164.slice(4)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export default function SignInScreen() {
  const { session, profile } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"enter" | "code">("enter");
  const [phone, setPhone] = useState(""); // as typed
  // What the code was actually sent to (E.164) — verify must use exactly this,
  // not whatever is in the input.
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  // The last code we tried, so a failed auto-verify doesn't retry the same
  // six digits in a loop — only a changed code verifies again.
  const lastTried = useRef("");

  // Ticks the resend countdown while the code step is open.
  useEffect(() => {
    if (phase !== "code") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Already signed in? Don't show sign-in — let the guards route onward.
  // (After every hook.)
  if (session) {
    return profileComplete(profile) ? <Redirect href="/" /> : <Redirect href="/(auth)/onboarding" />;
  }

  function authError(err: { code?: string; message: string }, fallbackKey: string) {
    if (__DEV__) console.warn("[sign-in]", err.code, err.message);
    setError(RATE_LIMIT_CODES.has(err.code ?? "") ? t("signIn.tooManyAttempts") : t(fallbackKey));
  }

  async function handleSendCode() {
    setError(null);
    const target = toE164IL(phone);
    if (!target) {
      setError(t("signIn.invalidPhone"));
      return;
    }
    setBusy(true);
    const { error } = await sendOtp(target);
    setBusy(false);
    if (error) {
      authError(error, "signIn.sendFailed");
      return;
    }
    setSentTo(target);
    setCode("");
    lastTried.current = "";
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setNow(Date.now());
    setPhase("code");
  }

  async function handleResend() {
    setError(null);
    setBusy(true);
    const { error } = await sendOtp(sentTo);
    setBusy(false);
    if (error) {
      authError(error, "signIn.sendFailed");
      return;
    }
    setResendAt(Date.now() + RESEND_SECONDS * 1000);
    setNow(Date.now());
  }

  async function handleVerify(value: string) {
    if (value.length !== CODE_LENGTH || busy) return;
    lastTried.current = value;
    setError(null);
    setBusy(true);
    const { error } = await verifyOtp(sentTo, value);
    setBusy(false);
    if (error) authError(error, "signIn.invalidCode");
    // On success, useAuth() updates and the <Redirect> above takes over.
  }

  function onCodeChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && digits !== lastTried.current) void handleVerify(digits);
  }

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const countdown = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.chalk }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top,
            paddingBottom: Math.max(insets.bottom, 20),
            paddingHorizontal: 24,
            gap: phase === "enter" ? 18 : 20,
          }}
        >
          {phase === "enter" ? (
            <>
              <View style={{ height: 40 }} />

              {/* Logo: volt CF tile + wordmark (never translated, always LTR). */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    backgroundColor: colors.volt,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontFamily: fonts.numBold, fontSize: 28, letterSpacing: -1, color: colors.ink }}>
                    CF
                  </Text>
                </View>
                <Text style={{ fontFamily: fonts.numBold, fontSize: 40, lineHeight: 42, color: colors.ink }}>
                  {t("signIn.appName")}
                </Text>
              </View>

              <View style={{ gap: 14 }}>
                <Display size={64}>{`${t("signIn.taglineLine1")}\n${t("signIn.taglineLine2")}`}</Display>
                <AppText size={17} lineHeight={26} tone="graphite">
                  {t("signIn.pitch")}
                </AppText>
              </View>

              <View style={{ flex: 1 }} />

              <View style={{ gap: 8 }}>
                <FieldLabel>{t("signIn.phoneLabel")}</FieldLabel>
                <Input
                  ltr
                  value={phone}
                  onChangeText={(v) => {
                    setPhone(v);
                    setError(null);
                  }}
                  placeholder={t("signIn.phonePlaceholder")}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  autoCorrect={false}
                  editable={!busy}
                  invalid={!!error}
                  onSubmitEditing={handleSendCode}
                  accessibilityLabel={t("signIn.phoneLabel")}
                />
                {error ? (
                  <AppText size={14} tone="ember">
                    {error}
                  </AppText>
                ) : null}
              </View>

              <Button label={t("signIn.sendCodeSms")} size={56} block loading={busy} onPress={handleSendCode} />

              <AppText size={13} tone="smoke" center>
                {t("signIn.firstTimeHint")}
              </AppText>
            </>
          ) : (
            <>
              <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <IconButton
                  icon={ChevronLeft}
                  mirror
                  iconSize={22}
                  accessibilityLabel={t("common.back")}
                  onPress={() => {
                    setPhase("enter");
                    setCode("");
                    setError(null);
                  }}
                />
              </View>

              <View style={{ gap: 10 }}>
                <Display size={52}>{t("signIn.codeTitle")}</Display>
                <AppText size={16} lineHeight={24} tone="graphite">
                  {t("signIn.codeSentTo", { phone: ltr(localPhone(sentTo)) })}
                </AppText>
              </View>

              <CodeInput
                value={code}
                onChangeText={onCodeChange}
                accessibilityLabel={t("signIn.codeLabel")}
                editable={!busy}
                invalid={!!error}
                inputProps={{
                  autoFocus: true,
                  keyboardType: "number-pad",
                  // Offer the code from the incoming SMS above the keyboard
                  // (iOS reads textContentType, Android the autoComplete hint).
                  textContentType: "oneTimeCode",
                  autoComplete: Platform.OS === "android" ? "sms-otp" : "one-time-code",
                }}
              />

              {error ? (
                <AppText size={14} tone="ember">
                  {error}
                </AppText>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon icon={Check} size={16} color={colors.voltInk} strokeWidth={2.6} />
                  <AppText size={14} tone="graphite" style={{ flexShrink: 1 }}>
                    {t("signIn.autoContinue")}
                  </AppText>
                </View>
              )}

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                {secondsLeft > 0 ? (
                  <AppText size={14} tone="smoke">
                    {t("signIn.resendIn", { time: ltr(countdown) })}
                  </AppText>
                ) : (
                  <TextButton label={t("signIn.resend")} tone="ink" underline disabled={busy} onPress={handleResend} />
                )}
                <TextButton
                  label={t("signIn.otherNumber")}
                  underline
                  disabled={busy}
                  onPress={() => {
                    setPhase("enter");
                    setCode("");
                    setError(null);
                  }}
                />
              </View>

              <View style={{ flex: 1 }} />

              <Button
                label={t("signIn.verifyAndSignIn")}
                size={56}
                block
                loading={busy}
                disabled={code.length !== CODE_LENGTH}
                onPress={() => handleVerify(code)}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

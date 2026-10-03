// app/join.tsx — V18b: a client joins their trainer with an invite code
// (route: /join, reached from the "Join your trainer" card on the client Home).
//
// Typing the trainer's code IS the consent: accept_invite (0020) links only
// the signed-in caller, and a trainer can no longer add anyone on their own.
// Wrong, used and expired codes all come back as one generic error on
// purpose (so codes can't be probed) — the screen says the same.
//
// D30b: restyled with the kit. There's no reference screen for it, so it
// borrows the SMS-code step's layout (auth-code.html): back button, headline,
// six boxes. The boxes are one hidden input, like the SMS code.

import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import ChevronLeft from "lucide-react-native/icons/chevron-left";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { AppText, Button, CodeInput, colors, Display, IconButton, TextButton } from "@/components/ui";

const CODE_LENGTH = 6;

export default function JoinScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState("");

  const join = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.rpc("accept_invite", { p_code: value });
      if (error) throw error;
    },
    onSuccess: () => {
      // The client's Home reads both: the join card disappears and the
      // trainer's scheduled workouts show up.
      queryClient.invalidateQueries({ queryKey: qk.myTrainerLinks.all });
      queryClient.invalidateQueries({ queryKey: qk.scheduledClient.all });
      router.replace("/");
    },
  });

  // Only clients join trainers. (After all hooks.)
  if (profile && profile.role !== "client") return <Redirect href="/" />;

  // P0001 = the function's own "invalid or expired" exception; anything else
  // is the network or the server, and deserves a different sentence.
  const errorText = join.error
    ? (join.error as { code?: string }).code === "P0001"
      ? t("join.invalidCode")
      : t("join.failed")
    : null;

  function onCodeChange(v: string) {
    // Codes are A–Z / 2–9 only; uppercasing here means a lowercase or spaced
    // paste still works (the server trims and uppercases too).
    const next = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
    setCode(next);
    if (join.error) join.reset();
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
            paddingHorizontal: 24,
            gap: 20,
          }}
        >
          <View style={{ height: 52, flexDirection: "row", alignItems: "center" }}>
            <IconButton
              icon={ChevronLeft}
              mirror
              iconSize={22}
              accessibilityLabel={t("common.back")}
              onPress={() => router.back()}
            />
          </View>

          <View style={{ gap: 10 }}>
            <Display size={52}>{t("join.title")}</Display>
            <AppText size={16} lineHeight={24} tone="graphite">
              {t("join.subtitle")}
            </AppText>
          </View>

          <CodeInput
            value={code}
            onChangeText={onCodeChange}
            accessibilityLabel={t("join.codeLabel")}
            editable={!join.isPending}
            invalid={!!errorText}
            inputProps={{
              autoFocus: true,
              autoCapitalize: "characters",
              autoCorrect: false,
              autoComplete: "off",
            }}
          />

          {errorText ? (
            <AppText size={14} tone="ember">
              {errorText}
            </AppText>
          ) : null}

          <View style={{ flex: 1 }} />

          <View style={{ gap: 4 }}>
            <Button
              label={t("join.joinButton")}
              size={56}
              block
              loading={join.isPending}
              disabled={code.length !== CODE_LENGTH}
              onPress={() => join.mutate(code)}
            />
            <TextButton
              label={t("join.notNow")}
              underline
              disabled={join.isPending}
              onPress={() => router.back()}
              style={{ alignSelf: "center" }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

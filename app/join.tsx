// app/join.tsx — V18b: a client joins their trainer with an invite code
// (route: /join, reached from the "Join your trainer" card on the client Home).
//
// Typing the trainer's code IS the consent: accept_invite (0020) links only
// the signed-in caller, and a trainer can no longer add anyone on their own.
// Wrong, used and expired codes all come back as one generic error on
// purpose (so codes can't be probed) — the screen says the same.

import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { LTR_WRITING_DIRECTION_ONLY } from "@/lib/i18n";

const CODE_LENGTH = 6;

export default function JoinScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");

  const join = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.rpc("accept_invite", { p_code: value });
      if (error) throw error;
    },
    onSuccess: () => {
      // The client's Home reads both: the join card disappears and the
      // trainer's scheduled workouts show up.
      queryClient.invalidateQueries({ queryKey: ["my-trainer-links"] });
      queryClient.invalidateQueries({ queryKey: ["scheduled-client"] });
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

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 justify-center px-6">
        <Text className="w-full text-left text-2xl font-bold text-slate-900">{t("join.title")}</Text>
        <Text className="mb-8 mt-1 w-full text-left text-base text-slate-500">{t("join.subtitle")}</Text>

        <TextInput
          className="rounded-xl border border-slate-300 px-4 py-3 text-center text-2xl tracking-[6px] text-slate-900"
          style={LTR_WRITING_DIRECTION_ONLY}
          placeholder="K7M2QX"
          placeholderTextColor="#cbd5e1"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={CODE_LENGTH}
          value={code}
          // Codes are A–Z / 2–9 only; uppercasing here means a lowercase or
          // spaced paste still works (the server trims and uppercases too).
          onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH))}
          editable={!join.isPending}
        />

        {errorText ? <Text className="mt-3 w-full text-left text-sm text-red-600">{errorText}</Text> : null}

        <Pressable
          className={`mt-6 items-center rounded-xl px-4 py-3 ${
            code.length === CODE_LENGTH ? "bg-slate-900 active:opacity-80" : "bg-slate-300"
          }`}
          disabled={code.length !== CODE_LENGTH || join.isPending}
          onPress={() => join.mutate(code)}
        >
          {join.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">{t("join.joinButton")}</Text>
          )}
        </Pressable>

        <Pressable className="mt-4 items-center" disabled={join.isPending} onPress={() => router.back()}>
          <Text className="text-sm text-slate-500">{t("join.notNow")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

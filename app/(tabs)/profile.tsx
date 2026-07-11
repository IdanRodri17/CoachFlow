// app/(tabs)/profile.tsx — the Profile tab (route: /profile).
//
// V1: shows who you are (name, role, account email) and lets you sign out.
// Signing out clears the Supabase session; the (tabs) guard then bounces you
// back to the sign-in screen automatically.
// V9 (client only): earned badges + a "Share progress" card (app/share-card).
// V10 (client only): sessions remaining, if the trainer has set up a package.
// V12a: language toggle (i18next + RTL — see lib/i18n.ts).

import { Link } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { BADGE_INFO, type BadgeType } from "@/lib/badges";
import { SUPPORTED_LOCALES, setLocale, type SupportedLocale } from "@/lib/i18n";
import { DevPanel } from "@/components/DevPanel";

const LOCALE_LABELS: Record<SupportedLocale, string> = { en: "English", he: "עברית" };

export default function ProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const { t, i18n } = useTranslation();
  const isClient = profile?.role === "client";

  const badges = useQuery({
    queryKey: ["badges", session?.user.id],
    enabled: isClient && !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badges")
        .select("type")
        .eq("client_id", session!.user.id)
        .order("earned_at", { ascending: true });
      if (error) throw error;
      return data.map((b) => b.type as BadgeType);
    },
  });

  const packageQuery = useQuery({
    queryKey: ["package", session?.user.id],
    enabled: isClient && !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("total_sessions, used_sessions")
        .eq("client_id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <ScrollView contentContainerClassName="px-6 pt-6 pb-10">
        <Text className="w-full text-left text-2xl font-bold text-slate-900">{t("profile.title")}</Text>

        <View className="mt-6 gap-4">
          <Field label={t("profile.name")} value={profile?.display_name ?? "—"} freeText />
          <Field
            label={t("profile.role")}
            value={profile?.role === "trainer" ? t("common.trainer") : t("common.client")}
          />
          <Field label={t("profile.account")} value={session?.user.email ?? session?.user.phone ?? "—"} />
        </View>

        {isClient && packageQuery.data ? (
          <View className="mt-6">
            <Text className="w-full text-left text-xs uppercase tracking-wide text-slate-400">
              {t("profile.sessionsRemaining")}
            </Text>
            <Text className="mt-1 text-base text-slate-900">
              {packageQuery.data.total_sessions - packageQuery.data.used_sessions} of{" "}
              {packageQuery.data.total_sessions}
            </Text>
          </View>
        ) : null}

        {isClient ? (
          <View className="mt-6">
            <Text className="w-full text-left text-xs uppercase tracking-wide text-slate-400">
              {t("profile.badges")}
            </Text>
            {badges.isLoading ? (
              <ActivityIndicator className="mt-2" />
            ) : badges.data && badges.data.length > 0 ? (
              <View className="mt-2 flex-row flex-wrap gap-2">
                {badges.data.map((type) => (
                  <View key={type} className="flex-row items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5">
                    <Text className="text-base">{BADGE_INFO[type].emoji}</Text>
                    <Text className="text-xs font-semibold text-amber-800">{BADGE_INFO[type].label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text className="mt-1 w-full text-left text-sm text-slate-400">
                {t("profile.noBadgesYet")}
              </Text>
            )}

            {session ? (
              <Link href={`/share-card/${session.user.id}`} asChild>
                <Pressable className="mt-4 items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80">
                  <Text className="text-base font-semibold text-white">{t("profile.shareProgress")}</Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : null}

        <View className="mt-6">
          <Text className="w-full text-left text-xs uppercase tracking-wide text-slate-400">
            {t("profile.language")}
          </Text>
          <View className="mt-2 flex-row gap-2">
            {SUPPORTED_LOCALES.map((locale) => {
              const active = i18n.language === locale;
              return (
                <Pressable
                  key={locale}
                  className={`flex-1 items-center rounded-xl border px-4 py-2.5 ${
                    active ? "border-slate-900 bg-slate-900" : "border-slate-300 active:bg-slate-100"
                  }`}
                  disabled={active}
                  onPress={() => setLocale(locale)}
                >
                  <Text className={`text-sm font-semibold ${active ? "text-white" : "text-slate-700"}`}>
                    {LOCALE_LABELS[locale]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable
          className="mt-10 items-center rounded-xl border border-red-300 px-4 py-3 active:opacity-70"
          onPress={signOut}
        >
          <Text className="text-base font-semibold text-red-600">{t("common.signOut")}</Text>
        </Pressable>

        {/* Dev-only quick switch between trainer/client (hidden in production). */}
        <DevPanel />
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, freeText }: { label: string; value: string; freeText?: boolean }) {
  return (
    <View>
      <Text className="w-full text-left text-xs uppercase tracking-wide text-slate-400">
        {label}
      </Text>
      <Text className="mt-1 w-full text-left text-base text-slate-900">
        {value}
      </Text>
    </View>
  );
}

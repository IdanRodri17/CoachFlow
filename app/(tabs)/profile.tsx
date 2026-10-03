// app/(tabs)/profile.tsx — Profile (client) and Settings (trainer)
// (route: /profile). Trainers reach it from the avatar on Home.
//
// D28b / D20h / D29c: rebuilt to docs/design/screens/client-profile.html and
// trainer-settings.html.
//   Client: avatar + name, the package as a segment meter, the share-card
//   entry with the current streak, "בזמן אימון" (lib/workoutPrefs.ts — on the
//   phone only), language, the exercise library, badges (until Progress gets
//   them, D28a), sign out, delete account.
//   Trainer: back to Home, profile card with "עריכה" for the name, language,
//   sign out, delete account, version.
// Not yet, because their data doesn't exist yet (main session):
//   "תזכורות" (profiles.sms_reminders_enabled, B4) and "העסק" (business name +
//   default price, B3). The email digest switch is gone for good: login is
//   SMS-only and the digest isn't scheduled (0022).
//
// Delete account calls the delete-account edge function (service-role only,
// never in the app); every owned row cascades away. Required by Apple/Google.

import { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Constants from "expo-constants";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import LogOut from "lucide-react-native/icons/log-out";
import Pencil from "lucide-react-native/icons/pencil";
import Sun from "lucide-react-native/icons/sun";
import Timer from "lucide-react-native/icons/timer";
import Trash from "lucide-react-native/icons/trash";
import Trophy from "lucide-react-native/icons/trophy";
import Vibrate from "lucide-react-native/icons/vibrate";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { BADGE_INFO, type BadgeType } from "@/lib/badges";
import { ltr, setLocale, type SupportedLocale } from "@/lib/i18n";
import { setWorkoutPref, useWorkoutPrefs } from "@/lib/workoutPrefs";
import {
  AppText,
  Avatar,
  Button,
  Card,
  Chip,
  colors,
  Display,
  GroupLabel,
  Icon,
  IconButton,
  Input,
  ListCard,
  ListRow,
  Num,
  Segmented,
  SegmentMeter,
  Sheet,
  Toggle,
} from "@/components/ui";

const LOCALE_LABELS: Record<SupportedLocale, string> = { he: "עברית", en: "English" };

/** "972525885818" → "052-588-5818". */
function localPhone(raw: string | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : local;
}

export default function ProfileScreen() {
  const { profile, session, signOut, patchProfile } = useAuth();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const prefs = useWorkoutPrefs();
  const isClient = profile?.role === "client";
  const userId = session?.user.id ?? "";
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const badges = useQuery({
    queryKey: qk.badges.own(userId),
    enabled: isClient && !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("badges")
        .select("type")
        .eq("client_id", userId)
        .order("earned_at", { ascending: true });
      if (error) throw error;
      return data.map((b) => b.type as BadgeType);
    },
  });

  // Same key and shape as the client Home's package query.
  const pkg = useQuery({
    queryKey: qk.package.own(userId),
    enabled: isClient && !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packages")
        .select("total_sessions, used_sessions")
        .eq("client_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Same key as the client Home's streak.
  const streak = useQuery({
    queryKey: qk.clientStreak.own(userId),
    enabled: isClient && !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("client_streaks").select("current_streak").eq("client_id", userId);
      if (error) throw error;
      return Math.max(0, ...data.map((r) => r.current_streak));
    },
  });

  const saveName = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId);
      if (error) throw error;
      return name;
    },
    // patchProfile, not refreshProfile: no global loading state, no remount.
    onSuccess: (name) => {
      patchProfile({ display_name: name });
      setEditing(false);
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
    },
    onSuccess: () => signOut(),
  });

  function confirmDeleteAccount() {
    Alert.alert(t("profile.deleteAccountTitle"), t("profile.deleteAccountMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("settings.deleteAccount"), style: "destructive", onPress: () => deleteAccount.mutate() },
    ]);
  }

  const name = profile?.display_name ?? "";
  const language = (
    <View style={{ gap: 8 }}>
      <GroupLabel>{t("settings.language")}</GroupLabel>
      <Segmented
        value={i18n.language === "he" ? "he" : "en"}
        onChange={(l) => setLocale(l)}
        options={(["he", "en"] as SupportedLocale[]).map((l) => ({ value: l, label: LOCALE_LABELS[l] }))}
      />
    </View>
  );
  const account = (
    <ListCard inset={16} padded>
      <ListRow density="setting" leading={<Icon icon={LogOut} size={22} />} title={t("settings.signOut")} onPress={signOut} />
      <ListRow
        density="setting"
        leading={<Icon icon={Trash} size={22} color={colors.ember} />}
        title={t("settings.deleteAccount")}
        subtitle={isClient ? undefined : t("settings.deleteHint")}
        onPress={deleteAccount.isPending ? undefined : confirmDeleteAccount}
      />
    </ListCard>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.chalk }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 30, gap: 22 }}
      >
        {isClient ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Avatar id={userId} name={name || "?"} size={72} />
              <View style={{ flex: 1, gap: 4 }}>
                <Display size={38}>{name}</Display>
              </View>
            </View>

            {pkg.data && pkg.data.total_sessions > 0 ? (
              <Card style={{ padding: 12, gap: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <AppText size={18} weight="semibold" lineHeight={23}>
                    {t("settings.packageTitle")}
                  </AppText>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                    <Num size={30}>{Math.max(0, pkg.data.total_sessions - pkg.data.used_sessions)}</Num>
                    <AppText size={14} tone="graphite">
                      {t("settings.left")}
                    </AppText>
                  </View>
                </View>
                <SegmentMeter total={pkg.data.total_sessions} filled={pkg.data.used_sessions} />
                <AppText size={13} tone="graphite">
                  {t("settings.usedOf", { used: pkg.data.used_sessions, total: pkg.data.total_sessions })}
                </AppText>
              </Card>
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/share-card/${userId}`)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                paddingVertical: 16,
                paddingHorizontal: 18,
                backgroundColor: colors.ink,
                borderRadius: 22,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
            >
              <Num size={56} tone="volt">
                {streak.data ?? 0}
              </Num>
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={17} weight="semibold" tone="bone">
                  {t("settings.shareTitle")}
                </AppText>
                <AppText size={14} tone="ash">
                  {t("settings.shareHint")}
                </AppText>
              </View>
              <Icon icon={ChevronRight} size={22} color={colors.bone} mirror />
            </Pressable>

            <View style={{ gap: 8 }}>
              <GroupLabel>{t("settings.duringWorkout")}</GroupLabel>
              <ListCard inset={16} padded>
                <ListRow
                  density="setting"
                  leading={<Icon icon={Vibrate} size={22} />}
                  title={t("settings.restAlerts")}
                  trailing={
                    <Toggle
                      value={prefs.restAlerts}
                      onValueChange={(v) => setWorkoutPref("restAlerts", v)}
                      accessibilityLabel={t("settings.restAlerts")}
                    />
                  }
                />
                <ListRow
                  density="setting"
                  leading={<Icon icon={Sun} size={22} />}
                  title={t("settings.keepAwake")}
                  subtitle={t("settings.keepAwakeHint")}
                  trailing={
                    <Toggle
                      value={prefs.keepAwake}
                      onValueChange={(v) => setWorkoutPref("keepAwake", v)}
                      accessibilityLabel={t("settings.keepAwake")}
                    />
                  }
                />
                <ListRow
                  density="setting"
                  leading={<Icon icon={Timer} size={22} />}
                  title={t("settings.autoRest")}
                  subtitle={t("settings.autoRestHint")}
                  trailing={
                    <Toggle
                      value={prefs.autoRest}
                      onValueChange={(v) => setWorkoutPref("autoRest", v)}
                      accessibilityLabel={t("settings.autoRest")}
                    />
                  }
                />
              </ListCard>
            </View>

            {language}

            <View style={{ gap: 8 }}>
              <GroupLabel>{t("settings.more")}</GroupLabel>
              <ListCard inset={16} padded>
                <ListRow
                  density="setting"
                  leading={<Icon icon={Dumbbell} size={22} />}
                  title={t("settings.exerciseLibrary")}
                  chevron
                  onPress={() => router.push("/exercises")}
                />
              </ListCard>
            </View>

            {badges.data && badges.data.length > 0 ? (
              <View style={{ gap: 8 }}>
                <GroupLabel>{t("settings.badges")}</GroupLabel>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {badges.data.map((type) => (
                    <Chip key={type} kind="pr" icon={Trophy} label={BADGE_INFO[type].label} />
                  ))}
                </View>
              </View>
            ) : null}

            {account}
          </>
        ) : (
          <>
            <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 8 }}>
              <IconButton
                icon={ChevronLeft}
                mirror
                iconSize={22}
                accessibilityLabel={t("common.back")}
                onPress={() => router.navigate("/")}
              />
              <AppText size={17} weight="semibold" center style={{ flex: 1 }}>
                {t("settings.title")}
              </AppText>
              <View style={{ width: 44 }} />
            </View>

            <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar id={userId} name={name || "?"} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText size={18} weight="semibold">
                  {name}
                </AppText>
                {localPhone(session?.user.phone) ? (
                  <AppText size={14} tone="graphite">
                    {ltr(localPhone(session?.user.phone)!)}
                  </AppText>
                ) : null}
              </View>
              <Button
                label={t("settings.edit")}
                icon={Pencil}
                variant="secondary"
                size={44}
                onPress={() => {
                  setNameDraft(name);
                  setEditing(true);
                }}
              />
            </Card>

            {language}
            {account}

            <AppText size={13} tone="smoke" center>
              {t("settings.version", { version: Constants.expoConfig?.version ?? "1.0" })}
            </AppText>
          </>
        )}

        {deleteAccount.error ? (
          <AppText size={14} tone="ember">
            {(deleteAccount.error as Error).message}
          </AppText>
        ) : null}
      </ScrollView>

      <Sheet visible={editing} onClose={() => setEditing(false)} closeLabel={t("common.cancel")} title={t("settings.editName")}>
        <Input
          size="md"
          value={nameDraft}
          onChangeText={setNameDraft}
          autoFocus
          autoCapitalize="words"
          maxLength={60}
          accessibilityLabel={t("settings.editName")}
        />
        {saveName.error ? (
          <AppText size={14} tone="ember">
            {(saveName.error as Error).message}
          </AppText>
        ) : null}
        <Button
          label={t("settings.save")}
          size={56}
          block
          loading={saveName.isPending}
          disabled={nameDraft.trim().length === 0}
          onPress={() => saveName.mutate(nameDraft.trim())}
        />
      </Sheet>
    </View>
  );
}

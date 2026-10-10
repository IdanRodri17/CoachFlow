// app/(tabs)/profile.tsx — Profile (client) and Settings (trainer)
// (route: /profile). Trainers reach it from the avatar on Home.
//
// D28b / D20h / D29c: rebuilt to docs/design/screens/client-profile.html and
// trainer-settings.html.
//   Client: avatar + name + "מתאמן/ת אצל {trainer} · מאז {month}" (rpc
//   my_trainer), the package as a segment meter, the share-card entry with
//   the current streak, "בזמן אימון" (lib/workoutPrefs.ts — on the phone
//   only), "תזכורות" (profiles.sms_reminders_enabled: one switch for both the
//   day-before and the morning-of SMS), language, the exercise library,
//   badges (until Progress gets them, D28a), sign out, delete account.
//   Trainer: back to Home, profile card with "עריכה" for the name, "העסק"
//   (the name on clients' share cards → profiles.business_name, and the
//   default price per session → profiles.default_price_per_session, 0025),
//   language, sign out, delete account, version.
// The email digest switch is gone for good: login is SMS-only and the digest
//   isn't scheduled (0022).
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
import Banknote from "lucide-react-native/icons/banknote";
import Bell from "lucide-react-native/icons/bell";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import LogOut from "lucide-react-native/icons/log-out";
import Pencil from "lucide-react-native/icons/pencil";
import Share from "lucide-react-native/icons/share";
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
import { trainerFirstName, useMyTrainer } from "@/lib/useMyTrainer";
import { formatMoney, monthName } from "@/components/home/format";
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
  parseTypedNumber,
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
  // Which profile field the edit sheet is open for, and its text.
  const [editing, setEditing] = useState<null | "name" | "business" | "price">(null);
  const [draft, setDraft] = useState("");

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

  type ProfilePatch = { display_name?: string; business_name?: string | null; default_price_per_session?: number | null };
  const saveField = useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
      if (error) throw error;
      return patch;
    },
    // patchProfile, not refreshProfile: no global loading state, no remount.
    onSuccess: (patch) => {
      patchProfile(patch);
      setEditing(null);
    },
  });

  function openEditor(field: "name" | "business" | "price") {
    saveField.reset();
    setDraft(
      field === "name"
        ? (profile?.display_name ?? "")
        : field === "business"
          ? (profile?.business_name ?? "")
          : profile?.default_price_per_session != null
            ? String(profile.default_price_per_session)
            : "",
    );
    setEditing(field);
  }

  const priceDraft = parseTypedNumber(draft);
  const canSave =
    editing === "name" ? draft.trim().length > 0 : editing === "price" ? draft.trim() === "" || priceDraft != null : true;
  function save() {
    if (editing === "name") saveField.mutate({ display_name: draft.trim() });
    else if (editing === "business") saveField.mutate({ business_name: draft.trim() === "" ? null : draft.trim() });
    else if (editing === "price") saveField.mutate({ default_price_per_session: draft.trim() === "" ? null : priceDraft });
  }

  const trainer = useMyTrainer();
  const trainerName = trainerFirstName(trainer.data);
  const since = trainer.data?.linked_since?.slice(0, 10);

  // D28b: one switch for both SMS reminders. Flipped in place first, put back
  // if the write fails.
  const reminders = profile?.sms_reminders_enabled ?? true;
  const setReminders = useMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase.from("profiles").update({ sms_reminders_enabled: on }).eq("id", userId);
      if (error) throw error;
    },
    onMutate: (on) => patchProfile({ sms_reminders_enabled: on }),
    onError: (_e, on) => patchProfile({ sms_reminders_enabled: !on }),
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
                {trainerName && since ? (
                  <AppText size={15} tone="graphite">
                    {t("settings.trainedBy", {
                      name: trainerName,
                      date: `${monthName(since, i18n.language)} ${since.slice(0, 4)}`,
                    })}
                  </AppText>
                ) : null}
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

            <View style={{ gap: 8 }}>
              <GroupLabel>{t("settings.reminders")}</GroupLabel>
              <ListCard inset={16} padded>
                <ListRow
                  density="setting"
                  leading={<Icon icon={Bell} size={22} />}
                  title={t("settings.smsReminders")}
                  subtitle={t("settings.smsRemindersHint")}
                  trailing={
                    <Toggle
                      value={reminders}
                      onValueChange={(v) => setReminders.mutate(v)}
                      accessibilityLabel={t("settings.smsReminders")}
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
                onPress={() => openEditor("name")}
              />
            </Card>

            <View style={{ gap: 8 }}>
              <GroupLabel>{t("settings.business")}</GroupLabel>
              <ListCard inset={16} padded>
                <ListRow
                  density="setting"
                  leading={<Icon icon={Share} size={22} />}
                  title={t("settings.shareName")}
                  trailing={
                    <AppText size={15} tone="graphite" numberOfLines={1} style={{ maxWidth: 140 }}>
                      {profile?.business_name || name}
                    </AppText>
                  }
                  chevron
                  onPress={() => openEditor("business")}
                />
                <ListRow
                  density="setting"
                  leading={<Icon icon={Banknote} size={22} />}
                  title={t("settings.defaultPrice")}
                  subtitle={t("settings.defaultPriceHint")}
                  trailing={
                    <AppText size={15} tone="graphite">
                      {profile?.default_price_per_session != null
                        ? ltr(`₪${formatMoney(profile.default_price_per_session, i18n.language)}`)
                        : t("settings.notSet")}
                    </AppText>
                  }
                  chevron
                  onPress={() => openEditor("price")}
                />
              </ListCard>
            </View>

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

      <Sheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        closeLabel={t("common.cancel")}
        title={
          editing === "business"
            ? t("settings.shareName")
            : editing === "price"
              ? t("settings.defaultPrice")
              : t("settings.editName")
        }
      >
        {editing === "price" ? (
          <Input
            size="md"
            ltr="start"
            suffix="₪"
            value={draft}
            onChangeText={setDraft}
            autoFocus
            keyboardType="decimal-pad"
            placeholder="180"
            maxLength={7}
            invalid={!canSave}
            accessibilityLabel={t("settings.defaultPrice")}
          />
        ) : (
          <Input
            size="md"
            value={draft}
            onChangeText={setDraft}
            autoFocus
            autoCapitalize="words"
            maxLength={60}
            placeholder={editing === "business" ? name : undefined}
            accessibilityLabel={editing === "business" ? t("settings.shareName") : t("settings.editName")}
          />
        )}
        {editing === "business" || editing === "price" ? (
          <AppText size={13} tone="graphite" lineHeight={19}>
            {editing === "business" ? t("settings.shareNameHint") : t("settings.defaultPriceSheetHint")}
          </AppText>
        ) : null}
        {saveField.error ? (
          <AppText size={14} tone="ember">
            {(saveField.error as Error).message}
          </AppText>
        ) : null}
        <Button label={t("settings.save")} size={56} block loading={saveField.isPending} disabled={!canSave} onPress={save} />
      </Sheet>
    </View>
  );
}

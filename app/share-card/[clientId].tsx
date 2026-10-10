// app/share-card/[clientId].tsx — client's shareable progress card (V9).
//
// Renders a branded card, captures it as an image via react-native-view-shot,
// and opens the native share sheet via expo-sharing (WhatsApp / Instagram /
// etc). Free marketing for the trainer whenever a client shares their
// progress. Client-only, and only for their own card (:clientId must match
// the signed-in session).
//
// D28c: rebuilt to docs/design/screens/client-share-card.html — an ink 9:16
// card: the trainer's line (business_name, else their name, via rpc
// my_trainer), the current streak huge in volt, workouts done and PRs this
// month, the client's first name + month, CoachFlow. Badges moved off the
// card (Progress shows them, D28a). "שמירה בגלריה" isn't here yet: it needs
// expo-media-library (a new dependency); the share sheet's "Save image"
// covers it meanwhile.

import { useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useTranslation } from "react-i18next";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import Share from "lucide-react-native/icons/share";

import { qk } from "@/lib/queryKeys";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { useMyTrainer } from "@/lib/useMyTrainer";
import { firstName, monthName } from "@/components/home/format";
import { AppText, Button, colors, Display, IconButton, Num } from "@/components/ui";

// The two guards run BEFORE the card's hooks mount (Rules of Hooks — see
// components/RoleGate.tsx); this screen has a second rule RoleGate doesn't
// cover: a client may only open their OWN card.
export default function ShareCardScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { session, profile } = useAuth();
  if (profile && profile.role !== "client") return <Redirect href="/" />;
  if (session && session.user.id !== clientId) return <Redirect href="/profile" />;
  return <ShareCardBody />;
}

function ShareCardBody() {
  const { t, i18n } = useTranslation();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The trainer through rpc my_trainer (B1): a client can't read the trainer's
  // profile row directly under RLS.
  const trainer = useMyTrainer();
  const trainerLine = trainer.data ? trainer.data.business_name?.trim() || trainer.data.display_name : "";
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;

  const card = useQuery({
    queryKey: qk.shareCard.own(clientId),
    queryFn: async () => {
      const [profileRes, streakRes, workoutCountRes, prRes] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", clientId).single(),
        supabase.from("client_streaks").select("current_streak").eq("client_id", clientId),
        supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("client_id", clientId),
        // PR sets logged since the 1st of this month (Jerusalem date).
        supabase
          .from("set_logs")
          .select("id, workout_logs!inner(client_id, completed_at)", { count: "exact", head: true })
          .eq("is_pr", true)
          .eq("workout_logs.client_id", clientId)
          .gte("workout_logs.completed_at", new Date(`${monthStart}T00:00:00+03:00`).toISOString()),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (streakRes.error) throw streakRes.error;
      if (workoutCountRes.error) throw workoutCountRes.error;
      if (prRes.error) throw prRes.error;
      return {
        name: profileRes.data.display_name,
        // One row per trainer; the card shows the best run.
        streak: Math.max(0, ...streakRes.data.map((r) => r.current_streak)),
        totalWorkouts: workoutCountRes.count ?? 0,
        prsThisMonth: prRes.count ?? 0,
      };
    },
  });

  async function handleShare() {
    setError(null);
    setSharing(true);
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 0.95 });
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        setError(t("shareCard.sharingUnavailable"));
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  const d = card.data;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.chalk,
        paddingTop: insets.top + 8,
        paddingHorizontal: 20,
        paddingBottom: Math.max(insets.bottom, 16) + 14,
        gap: 18,
      }}
    >
      <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <IconButton
          icon={ChevronLeft}
          mirror
          iconSize={22}
          accessibilityLabel={t("common.back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/profile"))}
        />
        <AppText size={17} weight="semibold" center style={{ flex: 1 }}>
          {t("shareCard.title")}
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      {card.error ? (
        <AppText size={14} tone="ember" center>
          {(card.error as Error).message}
        </AppText>
      ) : null}

      {d ? (
        // The captured image: 9:16, ink, the streak in volt.
        <View
          ref={cardRef}
          collapsable={false}
          accessibilityLabel={t("shareCard.cardLabel")}
          style={{
            alignSelf: "center",
            width: 290,
            height: 516,
            borderRadius: 28,
            backgroundColor: colors.ink,
            padding: 24,
            gap: 16,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <AppText size={14} weight="semibold" tone="bone" numberOfLines={1} style={{ flex: 1 }}>
              {trainerLine}
            </AppText>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.volt }} />
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ gap: 8 }}>
            <Num size={180} tone="volt" style={{ lineHeight: 160, letterSpacing: -4 }}>
              {d.streak}
            </Num>
            <Display size={40} tone="bone">
              {t("shareCard.streak")}
            </Display>
          </View>
          <View style={{ height: 1, backgroundColor: colors.ironLine }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Num size={40} tone="bone">
                {d.totalWorkouts}
              </Num>
              <AppText size={13} tone="ash">
                {t("shareCard.workoutsDone")}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Num size={40} tone="bone">
                {d.prsThisMonth}
              </Num>
              <AppText size={13} tone="ash">
                {t("shareCard.prsThisMonth")}
              </AppText>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <AppText size={13} tone="ash" numberOfLines={1} style={{ flex: 1 }}>
              {`${firstName(d.name)} · ${monthName(today, i18n.language)} ${today.slice(0, 4)}`}
            </AppText>
            <Num size={14} weight="semibold" tone="ash">
              CoachFlow
            </Num>
          </View>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      {error ? (
        <AppText size={14} tone="ember" center>
          {error}
        </AppText>
      ) : null}
      <Button
        label={t("shareCard.share")}
        icon={Share}
        variant="accent"
        size={56}
        block
        loading={sharing}
        disabled={!d}
        onPress={handleShare}
      />
    </View>
  );
}

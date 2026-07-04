// app/share-card/[clientId].tsx — client's shareable progress card (V9).
//
// Renders a branded card (trainer name/logo, streak, key stat, badges),
// captures it as an image via react-native-view-shot, and opens the native
// share sheet via expo-sharing (WhatsApp / Instagram / etc). Free marketing
// for the trainer whenever a client shares their progress. Client-only, and
// only for their own card (:clientId must match the signed-in session).

import { useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { BADGE_INFO, type BadgeType } from "@/lib/badges";

export default function ShareCardScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { session, profile } = useAuth();
  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile && profile.role !== "client") return <Redirect href="/" />;
  if (session && session.user.id !== clientId) return <Redirect href="/profile" />;

  const card = useQuery({
    queryKey: ["share-card", clientId],
    queryFn: async () => {
      const [profileRes, streakRes, badgesRes, workoutCountRes, rosterRes] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", clientId).single(),
        supabase.from("client_streaks").select("current_streak").eq("client_id", clientId).maybeSingle(),
        supabase.from("badges").select("type").eq("client_id", clientId).order("earned_at", { ascending: true }),
        supabase.from("workout_logs").select("id", { count: "exact", head: true }).eq("client_id", clientId),
        supabase
          .from("trainer_clients")
          .select("trainer_id")
          .eq("client_id", clientId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (streakRes.error) throw streakRes.error;
      if (badgesRes.error) throw badgesRes.error;
      if (workoutCountRes.error) throw workoutCountRes.error;
      if (rosterRes.error) throw rosterRes.error;

      let trainerName = "";
      let trainerAvatar: string | null = null;
      if (rosterRes.data?.trainer_id) {
        const { data: t } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", rosterRes.data.trainer_id)
          .maybeSingle();
        trainerName = t?.display_name ?? "";
        trainerAvatar = t?.avatar_url ?? null;
      }

      return {
        name: profileRes.data.display_name,
        streak: streakRes.data?.current_streak ?? 0,
        badges: badgesRes.data.map((b) => b.type as BadgeType),
        totalWorkouts: workoutCountRes.count ?? 0,
        trainerName,
        trainerAvatar,
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
        setError("Sharing isn't available on this device.");
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: "image/png" });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  if (card.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }
  if (card.error || !card.data) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-center text-sm text-red-600">
          {card.error ? (card.error as Error).message : "Couldn't load your progress."}
        </Text>
      </View>
    );
  }

  const d = card.data;

  return (
    <SafeAreaView className="flex-1 bg-slate-100" edges={["bottom"]}>
      <View className="flex-1 items-center justify-center px-6">
        <View ref={cardRef} collapsable={false} className="w-full max-w-sm rounded-3xl bg-indigo-900 p-6">
          <Text className="text-center text-lg font-bold text-white">{d.name}</Text>
          <Text className="mt-1 text-center text-5xl">🔥</Text>
          <Text className="text-center text-4xl font-extrabold text-white">{d.streak}</Text>
          <Text className="text-center text-sm font-medium uppercase tracking-wide text-indigo-200">
            day streak
          </Text>

          <View className="mt-6 items-center rounded-2xl bg-white/10 px-4 py-3">
            <Text className="text-3xl font-extrabold text-white">{d.totalWorkouts}</Text>
            <Text className="text-xs font-medium uppercase tracking-wide text-indigo-200">
              workouts completed
            </Text>
          </View>

          {d.badges.length > 0 ? (
            <View className="mt-6 flex-row flex-wrap justify-center gap-2">
              {d.badges.map((type) => (
                <View key={type} className="flex-row items-center gap-1 rounded-full bg-white/15 px-3 py-1.5">
                  <Text className="text-base">{BADGE_INFO[type].emoji}</Text>
                  <Text className="text-xs font-semibold text-white">{BADGE_INFO[type].label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {d.trainerName ? (
            <View className="mt-8 flex-row items-center justify-center gap-2">
              {d.trainerAvatar ? (
                <Image source={{ uri: d.trainerAvatar }} className="h-6 w-6 rounded-full" />
              ) : null}
              <Text className="text-xs font-medium text-indigo-200">Trained by {d.trainerName}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          className="mt-8 w-full max-w-sm items-center rounded-xl bg-slate-900 px-4 py-3.5 active:opacity-80"
          disabled={sharing}
          onPress={handleShare}
        >
          {sharing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">Share</Text>
          )}
        </Pressable>
        {error ? <Text className="mt-3 text-sm text-red-600">{error}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

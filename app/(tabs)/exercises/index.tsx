// app/(tabs)/exercises/index.tsx — the exercise library list.
//
// Trainers see an "Add exercise" button and tap a row to edit it.
// Clients see the same list (read-only) and tap a row to view + watch the video.
// Data is fetched with TanStack Query; RLS decides what each role can see.

import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function ExercisesListScreen() {
  const { profile } = useAuth();
  const isTrainer = profile?.role === "trainer";
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      {isTrainer ? (
        <View className="px-4 pt-4">
          <Pressable
            className="items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
            onPress={() => router.push("/exercises/new")}
          >
            <Text className="text-base font-semibold text-white">+ Add exercise</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <Text className="px-4 pt-4 text-sm text-red-600">{error.message}</Text>
      ) : null}

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-3"
        ListEmptyComponent={
          <View className="items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
            <Text className="text-center text-base font-medium text-slate-700">
              No exercises yet
            </Text>
            <Text className="mt-2 text-center text-sm text-slate-400">
              {isTrainer
                ? "Tap “Add exercise” to build your library."
                : "Your trainer hasn't added any exercises yet."}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={`/exercises/${item.id}`} asChild>
            <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50">
              <Text className="text-base font-semibold text-slate-900">{item.name}</Text>
              <Text className="mt-0.5 text-sm text-slate-500">
                {[item.muscle_group, item.video_url ? "🎬 video" : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}

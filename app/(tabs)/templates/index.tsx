// app/(tabs)/templates/index.tsx — the trainer's list of workout templates.
// Trainer-only (the tab is hidden for clients; we also guard here for safety).

import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, Redirect, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function TemplatesListScreen() {
  const { profile } = useAuth();
  const router = useRouter();

  // Templates are trainer-only.
  if (profile && profile.role !== "trainer") return <Redirect href="/" />;

  const { data, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_templates")
        .select("*")
        .order("created_at", { ascending: false });
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
      <View className="px-4 pt-4">
        <Pressable
          className="items-center rounded-xl bg-slate-900 px-4 py-3 active:opacity-80"
          onPress={() => router.push("/templates/new")}
        >
          <Text className="text-base font-semibold text-white">+ Create template</Text>
        </Pressable>
      </View>

      {error ? <Text className="px-4 pt-4 text-sm text-red-600">{error.message}</Text> : null}

      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4 gap-3"
        ListEmptyComponent={
          <View className="items-center rounded-2xl border border-dashed border-slate-300 px-6 py-12">
            <Text className="text-center text-base font-medium text-slate-700">No templates yet</Text>
            <Text className="mt-2 text-center text-sm text-slate-400">
              Build a reusable workout once, assign it to many clients later.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Link href={`/templates/${item.id}`} asChild>
            <Pressable className="rounded-xl border border-slate-200 bg-white px-4 py-3 active:bg-slate-50">
              <Text className="text-base font-semibold text-slate-900">{item.name}</Text>
              {item.description ? (
                <Text className="mt-0.5 text-sm text-slate-500">{item.description}</Text>
              ) : null}
            </Pressable>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}

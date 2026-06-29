// app/(tabs)/profile.tsx — the Profile tab (route: /profile).
//
// V1: shows who you are (name, role, account email) and lets you sign out.
// Signing out clears the Supabase session; the (tabs) guard then bounces you
// back to the sign-in screen automatically.

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { DevPanel } from "@/components/DevPanel";

export default function ProfileScreen() {
  const { profile, session, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-bold text-slate-900">Profile</Text>

        <View className="mt-6 gap-4">
          <Field label="Name" value={profile?.display_name ?? "—"} />
          <Field
            label="Role"
            value={profile?.role === "trainer" ? "Trainer" : "Client"}
          />
          <Field label="Account" value={session?.user.email ?? session?.user.phone ?? "—"} />
        </View>

        <Pressable
          className="mt-10 items-center rounded-xl border border-red-300 px-4 py-3 active:opacity-70"
          onPress={signOut}
        >
          <Text className="text-base font-semibold text-red-600">Sign out</Text>
        </Pressable>

        {/* Dev-only quick switch between trainer/client (hidden in production). */}
        <DevPanel />
      </View>
    </SafeAreaView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs uppercase tracking-wide text-slate-400">{label}</Text>
      <Text className="mt-1 text-base text-slate-900">{value}</Text>
    </View>
  );
}

// components/DevPanel.tsx — a development-only quick account switcher.
//
// Renders NOTHING unless __DEV__ is true (so it never appears in a production
// build). Two buttons jump between a throwaway Trainer and Client account so you
// can test both sides of the app without a second email address.

import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { devSignInAs, type DevRole } from "@/lib/devAuth";

export function DevPanel() {
  // Early-return BEFORE any hooks so we never violate the rules-of-hooks.
  if (!__DEV__) return null;
  return <DevPanelInner />;
}

function DevPanelInner() {
  const { profile, refreshProfile } = useAuth();
  const [busy, setBusy] = useState<DevRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(role: DevRole) {
    setBusy(role);
    setError(null);
    try {
      await devSignInAs(role);
      await refreshProfile();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700">
        Dev only · quick switch
      </Text>
      <View className="flex-row gap-2">
        <DevButton
          label="Trainer"
          active={profile?.role === "trainer"}
          busy={busy === "trainer"}
          onPress={() => go("trainer")}
        />
        <DevButton
          label="Client"
          active={profile?.role === "client"}
          busy={busy === "client"}
          onPress={() => go("client")}
        />
      </View>
      {error ? <Text className="mt-2 text-xs text-red-600">{error}</Text> : null}
    </View>
  );
}

function DevButton({
  label,
  active,
  busy,
  onPress,
}: {
  label: string;
  active: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className={`flex-1 items-center rounded-lg border px-3 py-2 ${
        active ? "border-amber-500 bg-amber-500" : "border-amber-300 bg-white"
      }`}
    >
      {busy ? (
        <ActivityIndicator color="#b45309" />
      ) : (
        <Text className={`text-sm font-semibold ${active ? "text-white" : "text-amber-700"}`}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

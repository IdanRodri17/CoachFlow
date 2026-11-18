// components/ui/ErrorScreen.tsx — R6: the fallback shown by every route-level
// ErrorBoundary, and by the profile-read retry screen.
//
// It renders in place of the ROOT layout when that crashes, i.e. OUTSIDE the
// providers (QueryClient, Auth) and possibly before fonts load. So: react-native
// primitives + useTranslation only (lib/i18n is initialised by a side-effect
// import, no provider needed), system font, and an explicit `direction`.

import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { layoutDirection } from "@/lib/i18n";

export function ErrorScreen({
  error,
  onRetry,
  title,
  body,
}: {
  /** Shown only under __DEV__. */
  error?: Error;
  onRetry: () => void;
  title?: string;
  body?: string;
}) {
  const { t } = useTranslation();
  return (
    <View
      style={{
        flex: 1,
        direction: layoutDirection(),
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#F5F4EF",
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700", color: "#131416", textAlign: "center" }}>
        {title ?? t("error.title")}
      </Text>
      <Text style={{ fontSize: 16, color: "#55585E", textAlign: "center", marginTop: 8 }}>
        {body ?? t("error.body")}
      </Text>
      {__DEV__ && error ? (
        <Text style={{ fontSize: 12, color: "#B0381B", textAlign: "left", marginTop: 12 }}>
          {error.message}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          marginTop: 24,
          minHeight: 48,
          paddingHorizontal: 28,
          borderRadius: 14,
          backgroundColor: "#D5F24B",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#131416" }}>{t("error.retry")}</Text>
      </Pressable>
    </View>
  );
}

/** What each layout exports as `ErrorBoundary` (Expo Router route-level API). */
export function RouteErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return <ErrorScreen error={error} onRetry={() => void retry()} />;
}

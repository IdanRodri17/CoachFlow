// components/ui/ScreenState.tsx — C9/C10, C12, C13: the states screens share
// when they have nothing normal to show.
//
// ScreenLoading: a spinner instead of a blank page while a detail loads.
// ScreenMessage: a detail screen with no row to render (deleted, stale link,
//   no connection). These screens hide the navigation header, so on iOS there
//   was no way out: it always has a back button, and a retry when retrying can
//   help.
// InlineError: a list or Home whose data failed to load. Without it the page
//   looked empty ("no sessions today") instead of broken.

import { ActivityIndicator, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import ChevronLeft from "lucide-react-native/icons/chevron-left";

import { AppText, Button, colors } from "./index";

export function ScreenLoading({ dark }: { dark?: boolean }) {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: dark ? colors.iron : colors.chalk }}
    >
      <ActivityIndicator color={dark ? colors.bone : colors.ink} />
    </View>
  );
}

export function ScreenMessage({
  message,
  onRetry,
  dark,
  fallbackHref = "/",
}: {
  message: string;
  onRetry?: () => void;
  /** The workout screen is dark (iron). */
  dark?: boolean;
  /** Where "back" goes when there's no history (opened from a link). */
  fallbackHref?: Href;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 20,
        backgroundColor: dark ? colors.iron : colors.chalk,
      }}
    >
      <AppText size={16} tone={dark ? "ash" : "graphite"} center>
        {message}
      </AppText>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Button
          label={t("common.back")}
          variant={dark ? "darkOutline" : "secondary"}
          size={48}
          icon={ChevronLeft}
          iconMirror
          onPress={() => (router.canGoBack() ? router.back() : router.replace(fallbackHref))}
        />
        {onRetry ? (
          <Button label={t("error.retry")} variant={dark ? "dark" : "primary"} size={48} onPress={onRetry} />
        ) : null}
      </View>
    </View>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 16,
        backgroundColor: colors.emberSoft,
      }}
    >
      <AppText size={14} tone="ember" style={{ flex: 1 }}>
        {message}
      </AppText>
      {onRetry ? <Button label={t("error.retry")} variant="secondary" size={44} onPress={onRetry} /> : null}
    </View>
  );
}

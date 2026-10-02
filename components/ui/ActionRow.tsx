// components/ui/ActionRow.tsx — D19c: "every card is actionable" (roadmap
// V19b). Wrap any card or list row to give it the same actions two ways: swipe
// to reveal them, or long-press to get them in a bottom sheet. Plus UndoToast
// for deletes that can be taken back.
//
// There's no reference screen for this — it's built only from the kit's tokens
// (DESIGN.md §3) so it looks like part of the design.
//
// Rules (roadmap V19b):
//   - Swipe and long-press offer the SAME actions.
//   - Destructive actions confirm, unless the screen offers Undo instead.
//   - A completed workout never gets Delete (package balance + revenue
//     history) — the screen simply doesn't pass a delete action for one.
//   - The actions sit at the END edge and the swipe mirrors: swipe left in
//     English, right in Hebrew. The swipe is physical, so this file picks the
//     side from isRTL() itself.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import ReanimatedSwipeable, { type SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, Button, colors, fonts, Icon, Sheet, useRTL, type IconComponent } from "./index";

export type RowActionTone = "edit" | "done" | "whatsapp" | "delete" | "neutral";

export type RowAction = {
  key: string;
  label: string;
  icon: IconComponent;
  tone: RowActionTone;
  onPress: () => void;
  /** Ask before running (destructive actions without Undo). */
  confirm?: { title: string; message: string; confirmLabel: string };
};

const TONE: Record<RowActionTone, { bg: string; fg: string }> = {
  edit: { bg: colors.mist, fg: colors.ink },
  done: { bg: colors.volt, fg: colors.ink },
  whatsapp: { bg: colors.skySoft, fg: colors.sky },
  delete: { bg: colors.ember, fg: colors.white },
  neutral: { bg: colors.mist, fg: colors.graphite },
};

const ACTION_WIDTH = 72;

function run(action: RowAction, cancelLabel: string) {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (!action.confirm) {
    action.onPress();
    return;
  }
  Alert.alert(action.confirm.title, action.confirm.message, [
    { text: cancelLabel, style: "cancel" },
    { text: action.confirm.confirmLabel, style: "destructive", onPress: action.onPress },
  ]);
}

export function ActionRow({
  actions,
  children,
  sheetTitle,
  disabled,
}: {
  /** Up to three; the first sits nearest the row. */
  actions: RowAction[];
  children: ReactNode;
  /** Title of the long-press sheet (usually the row's name). */
  sheetTitle?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const rtl = useRTL();
  const swipeRef = useRef<SwipeableMethods>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const shown = actions.slice(0, 3);
  const cancelLabel = t("common.cancel");

  if (disabled || shown.length === 0) return <>{children}</>;

  const renderActions = () => (
    <View style={{ flexDirection: "row" }}>
      {shown.map((a) => {
        const tone = TONE[a.tone];
        return (
          <Pressable
            key={a.key}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={() => {
              swipeRef.current?.close();
              run(a, cancelLabel);
            }}
            style={({ pressed }) => ({
              width: ACTION_WIDTH,
              backgroundColor: tone.bg,
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Icon icon={a.icon} size={22} color={tone.fg} />
            <AppText size={12} weight="semibold" lineHeight={15} center numberOfLines={1} style={{ color: tone.fg }}>
              {a.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <>
      <ReanimatedSwipeable
        ref={swipeRef}
        friction={2}
        overshootFriction={8}
        rightThreshold={40}
        leftThreshold={40}
        // Physical sides: the end edge is the right in English, the left in Hebrew.
        renderRightActions={rtl ? undefined : renderActions}
        renderLeftActions={rtl ? renderActions : undefined}
        onSwipeableWillOpen={() => void Haptics.selectionAsync()}
      >
        <Pressable
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setMenuOpen(true);
          }}
          delayLongPress={350}
          accessibilityHint={sheetTitle}
          accessibilityActions={shown.map((a) => ({ name: a.key, label: a.label }))}
          onAccessibilityAction={(e) => {
            const a = shown.find((x) => x.key === e.nativeEvent.actionName);
            if (a) run(a, cancelLabel);
          }}
        >
          {children}
        </Pressable>
      </ReanimatedSwipeable>

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} closeLabel={cancelLabel} title={sheetTitle}>
        <View style={{ gap: 8 }}>
          {shown.map((a) => (
            <Button
              key={a.key}
              label={a.label}
              icon={a.icon}
              variant={a.tone === "delete" ? "danger" : "secondary"}
              size={52}
              block
              onPress={() => {
                setMenuOpen(false);
                run(a, cancelLabel);
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}

/** A dark pill at the bottom with a volt "undo"; hides itself after 5 s.
 * Render it once at the bottom of the screen that deletes. */
export function UndoToast({
  message,
  undoLabel,
  onUndo,
  onHide,
  durationMs = 5000,
}: {
  /** null hides the toast. */
  message: string | null;
  undoLabel: string;
  onUndo: () => void;
  onHide: () => void;
  durationMs?: number;
}) {
  const insets = useSafeAreaInsets();
  // The latest onHide, so a parent re-render doesn't restart the timer.
  const hideRef = useRef(onHide);
  useEffect(() => {
    hideRef.current = onHide;
  });
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => hideRef.current(), durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs]);

  if (!message) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(180)}
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        start: 20,
        end: 20,
        bottom: Math.max(insets.bottom, 16) + 8,
        minHeight: 52,
        borderRadius: 26,
        backgroundColor: colors.ink,
        paddingStart: 18,
        paddingEnd: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <AppText size={15} tone="bone" numberOfLines={2} style={{ flex: 1 }}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          onUndo();
          onHide();
        }}
        style={({ pressed }) => ({ height: 44, paddingHorizontal: 14, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
      >
        <AppText size={15} weight="semibold" style={{ color: colors.volt, fontFamily: fonts.semibold }}>
          {undoLabel}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

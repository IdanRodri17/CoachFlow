// components/workout/PickView.tsx — choosing the next exercise from the
// library, inside the workout (Idan, 2026-11-26).
//
// A free workout (no template) used to jump straight to Finish: no clock, no
// sets, no exercises. It now starts here and comes back here whenever its
// exercises are done; a planned workout reaches it from the overview's "add
// an exercise". A picked exercise runs like a planned one (lib/workoutSession
// addExercise): ADDED_SETS sets, last time's numbers, live PRs, rest.
// A client's own workout with nothing logged yet ends with "ביטול האימון"
// (onDiscard): there's nothing to save (2026-11-27).

import { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Plus from "lucide-react-native/icons/plus";
import Search from "lucide-react-native/icons/search";

import type { WorkoutSession } from "@/lib/useWorkoutSession";
import { ADDED_SETS, canClosePicker } from "@/lib/workoutSession";
import { AppText, Button, colors, fonts, Icon, Pressable, useRTL } from "@/components/ui";

import { WorkoutHeader } from "./WorkoutHeader";

export type PickRow = { id: string; name: string; muscle_group: string | null };

export function PickView({
  session,
  title,
  library,
  loadingLibrary,
  addingId,
  onPick,
  onMinimize,
  onOverview,
  onDiscard,
}: {
  session: WorkoutSession;
  title: string;
  library: PickRow[];
  loadingLibrary: boolean;
  /** The exercise being loaded (its history), if any. */
  addingId: string | null;
  onPick: (row: PickRow) => void;
  onMinimize: () => void;
  onOverview: () => void;
  /** Given: the last button drops the workout instead of finishing it. */
  onDiscard?: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = useRTL();
  const { state: s, now } = session;
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? library.filter((e) => e.name.toLowerCase().includes(q)) : library;
  }, [query, library]);
  const first = s.exercises.length === 0;
  const busy = addingId != null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.iron }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, 16) + 14,
          paddingHorizontal: 20,
          gap: 14,
        }}
      >
        <WorkoutHeader state={s} now={now} title={title} onMinimize={onMinimize} onOverview={onOverview} />

        <View style={{ gap: 4 }}>
          <AppText size={26} weight="semibold" lineHeight={32} tone="bone">
            {first ? t("workout.pick.firstTitle") : t("workout.pick.nextTitle")}
          </AppText>
          <AppText size={14} tone="ash">
            {first && s.planned === 0 ? t("workout.pick.freeHint") : t("workout.pick.hint", { count: ADDED_SETS })}
          </AppText>
        </View>

        <View
          style={{
            height: 48,
            borderRadius: 14,
            backgroundColor: colors.iron3,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
            gap: 10,
          }}
        >
          <Icon icon={Search} size={18} color={colors.ash} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("workout.pick.search")}
            placeholderTextColor={colors.ash2}
            selectionColor={colors.volt}
            returnKeyType="search"
            accessibilityLabel={t("workout.pick.search")}
            style={{
              flex: 1,
              color: colors.bone,
              fontFamily: fonts.regular,
              fontSize: 16,
              paddingVertical: 0,
              textAlign: rtl ? "right" : "left",
            }}
          />
        </View>

        {loadingLibrary ? (
          <ActivityIndicator color={colors.bone} />
        ) : shown.length === 0 ? (
          <AppText size={14} tone="ash">
            {t("workout.pick.empty")}
          </AppText>
        ) : (
          <View style={{ borderRadius: 18, backgroundColor: colors.iron2, overflow: "hidden" }}>
            {shown.map((e, i) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityLabel={e.name}
                disabled={busy}
                onPress={() => onPick(e)}
                style={({ pressed }) => ({
                  minHeight: 56,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.ironLine,
                  backgroundColor: pressed ? colors.iron3 : "transparent",
                  opacity: busy && addingId !== e.id ? 0.5 : 1,
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <AppText size={16} weight="semibold" tone="bone" numberOfLines={1}>
                    {e.name}
                  </AppText>
                  {e.muscle_group ? (
                    <AppText size={13} tone="ash" numberOfLines={1}>
                      {t(`exercises.muscles.${e.muscle_group}`, { defaultValue: e.muscle_group })}
                    </AppText>
                  ) : null}
                </View>
                {addingId === e.id ? (
                  <ActivityIndicator color={colors.volt} />
                ) : (
                  <Icon icon={Plus} size={20} color={colors.volt} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {canClosePicker(s) ? (
          <Button label={t("workout.pick.back")} variant="darkOutline" size={52} block onPress={session.closePicker} />
        ) : null}
        {onDiscard ? (
          <Button label={t("workout.own.discard")} variant="darkOutline" size={56} block disabled={busy} onPress={onDiscard} />
        ) : (
          <Button label={t("workout.pick.finish")} variant="accent" size={56} block disabled={busy} onPress={session.finishNow} />
        )}
      </ScrollView>
    </View>
  );
}

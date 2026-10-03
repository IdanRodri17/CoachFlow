// components/AdjustmentModal.tsx — the workout mode's swap / skip sheet
// (D20c; docs/design/screens/workout-swap.html, DESIGN.md §6.2 rule 7).
//
// A dark bottom sheet: segmented החלפה | דילוג, reason chips (the chosen
// chip's text is the saved exercise_adjustments.reason; "סיבה אחרת" opens a
// text field), and for a swap three suggestions from the library — same
// muscle group first — plus a search over every exercise. The first reason
// and the first suggestion start selected, so the common case is one tap.

import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import ArrowLeftRight from "lucide-react-native/icons/arrow-left-right";
import Check from "lucide-react-native/icons/check";
import ChevronsLeft from "lucide-react-native/icons/chevrons-left";
import ChevronsRight from "lucide-react-native/icons/chevrons-right";
import Info from "lucide-react-native/icons/info";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";

import { isRTL, ltr } from "@/lib/i18n";
import { muscleKeyOf } from "@/components/ExerciseForm";
import {
  AppText,
  Button,
  colors,
  Icon,
  IconButton,
  Input,
  Segmented,
  SelectChip,
  Sheet,
  TextButton,
} from "@/components/ui";

export type AdjustmentResult = {
  action: "skip" | "swap";
  reason: string;
  swapId?: string;
  swapName?: string;
};

export type AdjustmentLibraryItem = {
  id: string;
  name: string;
  muscle_group?: string | null;
  default_sets?: number | null;
  default_reps?: number | null;
};

const REASONS = ["busy", "pain", "equipment", "other"] as const;
type Reason = (typeof REASONS)[number];
const SUGGESTIONS = 3;

export function AdjustmentModal({
  visible,
  mode,
  exerciseName,
  exerciseLabel,
  muscleGroup,
  library,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  /** Which tab the sheet opens on. */
  mode: "skip" | "swap" | null;
  exerciseName: string;
  /** "תרגיל 5 מתוך 6" above the name. */
  exerciseLabel?: string;
  /** The current exercise's muscle group — its matches are suggested first. */
  muscleGroup?: string | null;
  library: AdjustmentLibraryItem[]; // substitutes (current exercise excluded)
  onClose: () => void;
  onConfirm: (result: AdjustmentResult) => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel={t("workout.adjust.close")} dark>
      {/* Remounts per opening, so every opening starts from the defaults. */}
      {visible && mode ? (
        <AdjustmentBody
          initialMode={mode}
          exerciseName={exerciseName}
          exerciseLabel={exerciseLabel}
          muscleGroup={muscleGroup}
          library={library}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      ) : null}
    </Sheet>
  );
}

function AdjustmentBody({
  initialMode,
  exerciseName,
  exerciseLabel,
  muscleGroup,
  library,
  onClose,
  onConfirm,
}: {
  initialMode: "skip" | "swap";
  exerciseName: string;
  exerciseLabel?: string;
  muscleGroup?: string | null;
  library: AdjustmentLibraryItem[];
  onClose: () => void;
  onConfirm: (result: AdjustmentResult) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState(initialMode);
  const [reason, setReason] = useState<Reason>("busy");
  const [otherText, setOtherText] = useState("");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  // Same muscle group first, then the rest of the library in its order.
  const suggestions = useMemo(() => {
    const key = muscleKeyOf(muscleGroup);
    const same = key ? library.filter((e) => muscleKeyOf(e.muscle_group) === key) : [];
    return [...same, ...library.filter((e) => !same.includes(e))].slice(0, SUGGESTIONS);
  }, [library, muscleGroup]);
  // Until a tap, the first suggestion (the library may still be loading).
  const [tappedId, setPickedId] = useState<string | null>(null);
  const pickedId = tappedId ?? suggestions[0]?.id ?? null;
  const picked = library.find((e) => e.id === pickedId) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 30);
  }, [library, query]);

  const reasonText = reason === "other" ? otherText.trim() : t(`workout.adjust.reasons.${reason}`);
  const canConfirm = mode === "skip" || picked != null;
  const Forward = isRTL() ? ChevronsLeft : ChevronsRight;

  function confirm() {
    if (mode === "skip") onConfirm({ action: "skip", reason: reasonText });
    else if (picked) onConfirm({ action: "swap", reason: reasonText, swapId: picked.id, swapName: picked.name });
  }

  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          {exerciseLabel ? (
            <AppText size={13} tone="ash">
              {exerciseLabel}
            </AppText>
          ) : null}
          <AppText size={22} weight="semibold" lineHeight={29} tone="bone" numberOfLines={2}>
            {exerciseName}
          </AppText>
        </View>
        <IconButton icon={X} variant="dark" accessibilityLabel={t("workout.adjust.close")} onPress={onClose} />
      </View>

      <Segmented
        dark
        size="lg"
        value={mode}
        onChange={setMode}
        options={[
          { value: "swap", label: t("workout.mode.swap"), icon: ArrowLeftRight },
          { value: "skip", label: t("workout.mode.skip"), icon: Forward },
        ]}
      />

      <View style={{ gap: 10 }}>
        <AppText size={14} weight="semibold" tone="ash">
          {t("workout.adjust.whatHappened")}
        </AppText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {REASONS.map((r) => (
            <SelectChip
              key={r}
              dark
              label={t(`workout.adjust.reasons.${r}`)}
              selected={reason === r}
              onPress={() => setReason(r)}
            />
          ))}
        </View>
        {reason === "other" ? (
          <Input
            dark
            size="md"
            value={otherText}
            onChangeText={setOtherText}
            placeholder={t("workout.adjust.otherPlaceholder")}
            autoFocus
          />
        ) : null}
      </View>

      {mode === "swap" ? (
        <View style={{ gap: 8 }}>
          <AppText size={14} weight="semibold" tone="ash">
            {t("workout.adjust.swapWith")}
          </AppText>
          {library.length === 0 ? (
            <AppText size={14} tone="ash">
              {t("workout.adjust.noOtherExercises")}
            </AppText>
          ) : searching ? (
            <>
              <Input
                dark
                size="md"
                value={query}
                onChangeText={setQuery}
                leadingIcon={Search}
                placeholder={t("workout.adjust.searchPlaceholder")}
                autoFocus
              />
              <ScrollView style={{ maxHeight: 216 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
                {results.map((e) => (
                  <SubstituteRow key={e.id} item={e} selected={e.id === pickedId} onPress={() => setPickedId(e.id)} />
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              {suggestions.map((e) => (
                <SubstituteRow key={e.id} item={e} selected={e.id === pickedId} onPress={() => setPickedId(e.id)} />
              ))}
              {library.length > suggestions.length ? (
                <TextButton
                  label={t("workout.adjust.searchAll")}
                  tone="ash"
                  onPress={() => setSearching(true)}
                  style={{ alignSelf: "flex-start" }}
                />
              ) : null}
            </>
          )}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon icon={Info} size={16} color={colors.ash} />
        <AppText size={13} tone="ash" style={{ flexShrink: 1 }}>
          {mode === "swap" ? t("workout.adjust.trainerSeesSwap") : t("workout.adjust.trainerSeesSkip")}
        </AppText>
      </View>

      <Button
        label={
          mode === "skip"
            ? t("workout.adjust.skipCta")
            : picked
              ? t("workout.adjust.swapCta", { name: picked.name })
              : t("workout.mode.swap")
        }
        icon={mode === "skip" ? Forward : ArrowLeftRight}
        variant="accent"
        size={60}
        block
        disabled={!canConfirm}
        onPress={confirm}
      />
    </>
  );
}

function SubstituteRow({
  item,
  selected,
  onPress,
}: {
  item: AdjustmentLibraryItem;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const key = muscleKeyOf(item.muscle_group);
  const muscle = key ? t(`exercises.muscles.${key}`) : item.muscle_group?.trim() || null;
  const scheme =
    item.default_sets != null || item.default_reps != null
      ? ltr(`${item.default_sets ?? "—"} × ${item.default_reps ?? "—"}`)
      : null;
  const sub = [muscle, scheme].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 16,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.volt : colors.ironLine,
        // Every row is a visible card (Idan couldn't read them on the bare sheet).
        backgroundColor: colors.iron3,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? colors.volt : "transparent",
          borderWidth: selected ? 0 : 2,
          borderColor: colors.ash2,
        }}
      >
        {selected ? <Icon icon={Check} size={15} color={colors.ink} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText size={16} weight="semibold" tone="bone" numberOfLines={1} style={{ color: colors.bone }}>
          {item.name}
        </AppText>
        {sub ? (
          <AppText size={13} tone="ash" numberOfLines={1}>
            {sub}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

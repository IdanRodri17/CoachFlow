// components/workout/FinishView.tsx — D20e: the last step of workout mode
// (docs/design/screens/workout-finish.html, DESIGN.md §6.2 rule 9). "סיימת!",
// three stat tiles, the volt PR card (or a calm one), effort 1–10 as a 5×2
// grid, note chips + a free note joined into workout_logs.client_note, then
// "שמירה וסיום". The save itself is the host's (lib/useWorkoutSession.ts
// saveWorkout); this view only collects effort + note.

import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Check from "lucide-react-native/icons/check";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import Flame from "lucide-react-native/icons/flame";
import Pencil from "lucide-react-native/icons/pencil";
import Share from "lucide-react-native/icons/share";
import Trophy from "lucide-react-native/icons/trophy";

import { ltr } from "@/lib/i18n";
import { formatElapsed, formatWeight } from "@/lib/workoutSession";
import { AppText, Button, colors, Display, Icon, Input, Num, SelectChip, type IconComponent } from "@/components/ui";

const NOTE_CHIPS = ["great", "knee", "tired", "rushed"] as const;
type NoteChip = (typeof NOTE_CHIPS)[number];

export type FinishInput = { effort: number | null; note: string | null; durationSeconds: number };

export function FinishView({
  subtitle,
  startedAt,
  showDuration,
  sets,
  streak,
  prs,
  saving,
  errorMessage,
  onSave,
  onShare,
}: {
  /** "רגליים + ליבה · יום שבת, 3 באוקטובר". */
  subtitle: string;
  startedAt: number;
  /** False for a free workout (no template): there was no timed session. */
  showDuration: boolean;
  sets: number;
  /** The streak once this workout counts; null hides the tile. */
  streak: number | null;
  prs: { name: string; weight: number; reps: number }[];
  saving: boolean;
  errorMessage: string | null;
  onSave: (input: FinishInput) => void;
  onShare?: (input: FinishInput) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // The clock stops when this step appears, not when "save" is tapped.
  const [endedAt] = useState(() => Date.now());
  const [effort, setEffort] = useState<number | null>(null);
  const [chips, setChips] = useState<NoteChip[]>([]);
  const [freeOpen, setFreeOpen] = useState(false);
  const [freeText, setFreeText] = useState("");

  const durationMs = endedAt - startedAt;
  const first = prs[0];

  function input(): FinishInput {
    const parts = [...chips.map((c) => t(`workout.finish.notes.${c}`)), freeOpen ? freeText.trim() : ""].filter(Boolean);
    return {
      effort,
      note: parts.length ? parts.join(" · ") : null,
      durationSeconds: Math.round(durationMs / 1000),
    };
  }

  function toggleChip(c: NoteChip) {
    setChips((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.iron }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 16,
          paddingBottom: Math.max(insets.bottom, 16) + 14,
          paddingHorizontal: 20,
          gap: 22,
        }}
      >
        <View style={{ gap: 6 }}>
          <Display size={76} tone="bone">
            {t("workout.finish.title")}
          </Display>
          <AppText size={16} tone="ash">
            {subtitle}
          </AppText>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {showDuration ? <StatTile value={formatElapsed(durationMs)} label={t("workout.finish.duration")} /> : null}
          {showDuration ? <StatTile value={String(sets)} label={t("workout.finish.sets")} /> : null}
          {streak != null ? <StatTile value={String(streak)} label={t("workout.finish.streak")} icon={Flame} /> : null}
        </View>

        {first ? (
          <View
            style={{
              borderRadius: 20,
              backgroundColor: colors.volt,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: colors.ink,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon icon={Trophy} size={26} color={colors.volt} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={13} weight="semibold">
                {prs.length > 1 ? t("workout.finish.newPrMore", { count: prs.length - 1 }) : t("workout.finish.newPr")}
              </AppText>
              <AppText size={18} weight="bold" numberOfLines={2}>
                {first.name}
              </AppText>
            </View>
            <Num size={28}>{ltr(`${formatWeight(first.weight)} × ${first.reps}`)}</Num>
          </View>
        ) : sets > 0 ? (
          <View
            style={{
              borderRadius: 20,
              backgroundColor: colors.iron2,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                backgroundColor: colors.iron3,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon icon={Dumbbell} size={24} color={colors.ash} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <AppText size={16} weight="semibold" tone="bone">
                {t("workout.finish.noPrTitle")}
              </AppText>
              <AppText size={13} tone="ash">
                {t("workout.finish.noPrBody")}
              </AppText>
            </View>
          </View>
        ) : null}

        {/* Effort 1–10: 1 sits at the start edge (right in Hebrew). */}
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <AppText size={18} weight="semibold" tone="bone">
              {t("workout.finish.effortTitle")}
            </AppText>
            <AppText size={13} tone="ash">
              {t("workout.finish.effortScale")}
            </AppText>
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel={t("workout.finish.effortLabel")} style={{ gap: 8 }}>
            {[0, 5].map((row) => (
              <View key={row} style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((k) => {
                  const n = row + k;
                  const on = effort === n;
                  return (
                    <Pressable
                      key={n}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      onPress={() => setEffort(on ? null : n)}
                      style={({ pressed }) => ({
                        flex: 1,
                        height: 52,
                        borderRadius: 14,
                        borderWidth: on ? 0 : 1,
                        borderColor: colors.ironLine,
                        backgroundColor: on ? colors.volt : colors.iron2,
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Num size={24} tone={on ? "ink" : "bone"} center>
                        {n}
                      </Num>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        <View style={{ gap: 12 }}>
          <AppText size={18} weight="semibold" tone="bone">
            {t("workout.finish.notesTitle")}
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {NOTE_CHIPS.map((c) => (
              <SelectChip
                key={c}
                dark
                label={t(`workout.finish.notes.${c}`)}
                selected={chips.includes(c)}
                onPress={() => toggleChip(c)}
              />
            ))}
            <SelectChip
              dark
              icon={Pencil}
              label={t("workout.finish.notes.free")}
              selected={freeOpen}
              onPress={() => setFreeOpen((v) => !v)}
            />
          </View>
          {freeOpen ? (
            <Input
              dark
              size="md"
              multiline
              value={freeText}
              onChangeText={setFreeText}
              placeholder={t("workout.finish.freePlaceholder")}
              autoFocus
              containerStyle={{ minHeight: 88 }}
            />
          ) : null}
        </View>

        <View style={{ flex: 1 }} />

        {errorMessage ? (
          <AppText size={14} tone="ember" center>
            {errorMessage}
          </AppText>
        ) : null}

        <View style={{ gap: 4 }}>
          <Button
            label={t("workout.finish.save")}
            icon={Check}
            variant="accent"
            size={64}
            block
            loading={saving}
            onPress={() => onSave(input())}
          />
          {onShare ? (
            <Button
              label={t("workout.finish.share")}
              icon={Share}
              variant="darkGhost"
              size={44}
              block
              disabled={saving}
              onPress={() => onShare(input())}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function StatTile({ value, label, icon }: { value: string; label: string; icon?: IconComponent }) {
  return (
    <View style={{ flex: 1, borderRadius: 18, backgroundColor: colors.iron2, paddingVertical: 14, paddingHorizontal: 12, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {icon ? <Icon icon={icon} size={18} color={colors.volt} /> : null}
        <Num size={34} tone="bone" tabular>
          {value}
        </Num>
      </View>
      <AppText size={13} tone="ash">
        {label}
      </AppText>
    </View>
  );
}

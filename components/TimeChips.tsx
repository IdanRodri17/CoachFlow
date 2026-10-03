// components/TimeChips.tsx — an optional, Expo-Go-safe time picker.
//
// Hourly slots (06:00–21:00) plus "Any time" (null). Values are "HH:MM" strings
// (or null). Same idea as DateChips — no native module.
//
// D24b: wrapped chips from the design (trainer-new-session.html) with the
// numbers in Barlow; times the trainer already has a session at are crossed
// out as "תפוס" and can't be picked. A current value that isn't on the hour
// (e.g. 09:30 when editing) gets its own chip so it stays visible.

import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";

import { AppText, colors, Num, SelectChip } from "@/components/ui";

const SLOTS: string[] = [];
for (let h = 6; h <= 21; h += 1) SLOTS.push(`${String(h).padStart(2, "0")}:00`);

export function TimeChips({
  value,
  onChange,
  busy = [],
}: {
  value: string | null;
  onChange: (time: string | null) => void;
  /** "HH:MM" times that are already booked on the chosen date. */
  busy?: string[];
}) {
  const { t } = useTranslation();
  const slots = value && !SLOTS.includes(value) ? [...SLOTS, value].sort() : SLOTS;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {slots.map((slot) => {
        const selected = slot === value;
        const taken = !selected && busy.includes(slot);
        return (
          <Pressable
            key={slot}
            onPress={() => onChange(slot)}
            disabled={taken}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: taken }}
            accessibilityLabel={taken ? `${slot} ${t("sessionForm.busy")}` : slot}
            style={({ pressed }) => ({
              height: 44,
              paddingHorizontal: 14,
              borderRadius: 12,
              borderWidth: taken ? 0 : 1,
              borderColor: selected ? colors.ink : colors.lineStrong,
              backgroundColor: taken ? colors.mist : selected ? colors.ink : colors.paper,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Num
              size={17}
              weight="semibold"
              tone={taken ? "smoke" : selected ? "white" : "ink"}
              style={taken ? { textDecorationLine: "line-through" } : undefined}
            >
              {slot}
            </Num>
            {taken ? (
              <AppText size={12} tone="smoke">
                {t("sessionForm.busy")}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
      <SelectChip label={t("sessionForm.anyTime")} selected={value === null} onPress={() => onChange(null)} />
    </View>
  );
}

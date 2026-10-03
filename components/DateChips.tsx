// components/DateChips.tsx — a simple, Expo-Go-safe date picker.
//
// Instead of a native calendar (which needs a dev build), a horizontal strip of
// selectable day chips starting today. All dates are "YYYY-MM-DD" resolved via
// lib/dates.ts (Asia/Jerusalem), so there are no time-zone surprises.
//
// D24b: the kit's select chips, labelled like the design ("ו׳ 2.10").

import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";

import { addDays, todayISO } from "@/lib/dates";
import { SelectChip } from "@/components/ui";
import { shortDate, weekdayLetter } from "@/components/home/format";

export function DateChips({
  value,
  onChange,
  days = 60,
}: {
  value: string;
  onChange: (dateISO: string) => void;
  days?: number;
}) {
  const { i18n } = useTranslation();
  const start = todayISO();
  const options = Array.from({ length: days }, (_, i) => addDays(start, i));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {options.map((d) => (
        <SelectChip
          key={d}
          label={`${weekdayLetter(d, i18n.language)} ${shortDate(d, i18n.language)}`}
          selected={d === value}
          onPress={() => onChange(d)}
        />
      ))}
    </ScrollView>
  );
}

// components/DateChips.tsx — a simple, Expo-Go-safe date picker.
//
// Instead of a native calendar (which needs a dev build), we show a horizontal
// strip of selectable day chips starting today. Good for scheduling a workout in
// the next few weeks. All dates are "YYYY-MM-DD" resolved via lib/dates.ts
// (Asia/Jerusalem), so there are no time-zone surprises.

import { Pressable, ScrollView, Text } from "react-native";

import { addDays, formatDisplayDate, todayISO } from "@/lib/dates";

export function DateChips({
  value,
  onChange,
  days = 28,
}: {
  value: string;
  onChange: (dateISO: string) => void;
  days?: number;
}) {
  const start = todayISO();
  const options = Array.from({ length: days }, (_, i) => addDays(start, i));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 py-1 pr-4"
    >
      {options.map((d) => {
        const selected = d === value;
        return (
          <Pressable
            key={d}
            onPress={() => onChange(d)}
            className={`rounded-xl border px-3 py-2 ${
              selected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
            }`}
          >
            <Text className={`text-sm font-medium ${selected ? "text-white" : "text-slate-700"}`}>
              {formatDisplayDate(d)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

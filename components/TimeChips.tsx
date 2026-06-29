// components/TimeChips.tsx — an optional, Expo-Go-safe time picker.
//
// A horizontal strip of 1-hour slots (05:00–22:00) plus "Any time" (null).
// Values are "HH:MM" strings (or null). Same idea as DateChips — no native module.

import { Pressable, ScrollView, Text } from "react-native";

// Build the slots once at module load (one per hour).
const SLOTS: string[] = [];
for (let h = 5; h <= 22; h += 1) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
}

export function TimeChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (time: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 py-1 pr-4"
    >
      <Chip label="Any time" selected={value === null} onPress={() => onChange(null)} />
      {SLOTS.map((t) => (
        <Chip key={t} label={t} selected={value === t} onPress={() => onChange(t)} />
      ))}
    </ScrollView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-xl border px-3 py-2 ${
        selected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
      }`}
    >
      <Text className={`text-sm font-medium ${selected ? "text-white" : "text-slate-700"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

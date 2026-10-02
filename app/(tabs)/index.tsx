// app/(tabs)/index.tsx — the Home tab (route: /).
//
// D22 / D23b: the two homes live in their own components —
// components/home/ClientToday.tsx (the client's "היום") and
// components/home/TrainerHome.tsx (the trainer's next-up card, today's list,
// "לתשומת לבך" and the money card), rebuilt to the design handoff.
//
// formatMoney and MoneyStat stay exported from here because app/money.tsx
// imports them; they move with Money's own redesign (D27).

import { Text, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { ClientToday } from "@/components/home/ClientToday";
import { TrainerHome } from "@/components/home/TrainerHome";

export { formatMoney } from "@/components/home/format";

export default function HomeScreen() {
  const { profile } = useAuth();
  return profile?.role === "trainer" ? <TrainerHome /> : <ClientToday />;
}

export function MoneyStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View className="flex-1">
      <Text className="w-full text-left text-xs text-slate-400">{label}</Text>
      <Text className={`mt-0.5 w-full text-left text-base font-semibold ${accent ? "text-red-600" : "text-slate-900"}`}>
        ₪{value}
      </Text>
    </View>
  );
}

// app/(tabs)/index.tsx — the Home tab (route: /).
//
// D22 / D23b: the two homes live in their own components —
// components/home/ClientToday.tsx (the client's "היום") and
// components/home/TrainerHome.tsx (the trainer's next-up card, today's list,
// "לתשומת לבך" and the money card), rebuilt to the design handoff.

import { useAuth } from "@/lib/auth";
import { ClientToday } from "@/components/home/ClientToday";
import { TrainerHome } from "@/components/home/TrainerHome";

export default function HomeScreen() {
  const { profile } = useAuth();
  return profile?.role === "trainer" ? <TrainerHome /> : <ClientToday />;
}
